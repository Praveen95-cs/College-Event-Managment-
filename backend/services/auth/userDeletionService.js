const mongoose = require('mongoose');
const User = require('../../models/auth/User');
const EmailOtp = require('../../models/auth/EmailOtp');
const Event = require('../../models/events/Event');
const Registration = require('../../models/events/Registration');
const Competition = require('../../models/competitions/Competition');
const AssessmentAssignment = require('../../models/competitions/AssessmentAssignment');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const Notification = require('../../models/community/Notification');
const Message = require('../../models/community/Message');
const Club = require('../../models/feed/Club');
const ClubFollow = require('../../models/feed/ClubFollow');
const FeedPost = require('../../models/feed/FeedPost');
const PostLike = require('../../models/feed/PostLike');
const PostSave = require('../../models/feed/PostSave');
const Comment = require('../../models/feed/Comment');

function createError(message, status = 400, code = 'USER_DELETE_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Permanently removes a non-admin user and cleanly removes all dependent
 * registrations, attendee seat refs, assessment attempts, YouPI sessions,
 * social likes/saves/follows/comments, notifications, messages, and OTP rows.
 * Events/Competitions/FeedPosts created by a deleted organizer are preserved
 * and reassigned to the acting admin so campus schedules don't break.
 */
async function cascadeDeleteUser(targetUserId, actingAdminId) {
  if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  const target = await User.findById(targetUserId).select('name email role department');
  if (!target) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (actingAdminId && target._id.toString() === actingAdminId.toString()) {
    throw createError('You cannot delete your own active admin account.', 403, 'SELF_DELETE_FORBIDDEN');
  }
  if (target.role === 'admin') {
    throw createError('Admin accounts cannot be deleted from this panel.', 403, 'ADMIN_DELETE_FORBIDDEN');
  }

  const uid = target._id;
  const fallbackOwnerId = actingAdminId || uid;

  // 1. Pull user from Event attendee arrays and wipe Registrations
  const [attendeePullRes, regDelRes] = await Promise.all([
    Event.updateMany({ attendees: uid }, { $pull: { attendees: uid } }),
    Registration.deleteMany({ user: uid })
  ]);

  // Clear dangling attendanceMarkedBy references if organizer is deleted
  await Registration.updateMany({ attendanceMarkedBy: uid }, { $set: { attendanceMarkedBy: null } });

  // 2. Clean up exam assignments, YouPI sessions, notifications, messages, OTPs
  const [assignDelRes, youpiDelRes] = await Promise.all([
    AssessmentAssignment.deleteMany({ user: uid }),
    YoupiPaymentSession.deleteMany({ user: uid }),
    Notification.deleteMany({ user: uid }),
    Message.deleteMany({ user: uid }),
    EmailOtp.deleteMany({ email: target.email })
  ]);

  // 3. Social follow / like / save / comment count reconciliation
  const [userFollows, userLikes, userSaves, commentCountsByPost] = await Promise.all([
    ClubFollow.find({ user: uid }).select('club').lean(),
    PostLike.find({ user: uid }).select('post').lean(),
    PostSave.find({ user: uid }).select('post').lean(),
    Comment.aggregate([{ $match: { user: uid } }, { $group: { _id: '$post', count: { $sum: 1 } } }])
  ]);

  await Promise.all([
    ClubFollow.deleteMany({ user: uid }),
    PostLike.deleteMany({ user: uid }),
    PostSave.deleteMany({ user: uid }),
    Comment.deleteMany({ user: uid })
  ]);

  if (userFollows.length > 0) {
    const clubIds = [...new Set(userFollows.map(f => f.club?.toString()).filter(Boolean))];
    await Promise.all(
      clubIds.map(async clubId => {
        const count = await ClubFollow.countDocuments({ club: clubId });
        await Club.updateOne({ _id: clubId }, { $set: { followersCount: count } });
      })
    );
  }

  if (userLikes.length > 0) {
    const postIds = [...new Set(userLikes.map(l => l.post?.toString()).filter(Boolean))];
    await Promise.all(
      postIds.map(async postId => {
        const count = await PostLike.countDocuments({ post: postId });
        await FeedPost.updateOne({ _id: postId }, { $set: { likesCount: count } });
      })
    );
  }

  if (userSaves.length > 0) {
    const postIds = [...new Set(userSaves.map(s => s.post?.toString()).filter(Boolean))];
    await Promise.all(
      postIds.map(async postId => {
        const count = await PostSave.countDocuments({ post: postId });
        await FeedPost.updateOne({ _id: postId }, { $set: { savesCount: count } });
      })
    );
  }

  if (commentCountsByPost.length > 0) {
    await Promise.all(
      commentCountsByPost.map(async entry => {
        if (!entry._id) return;
        const count = await Comment.countDocuments({ post: entry._id });
        await FeedPost.updateOne({ _id: entry._id }, { $set: { commentsCount: count } });
      })
    );
  }

  // 4. Club memberships & ownership reassignment so published events/clubs remain intact
  const [eventsReassigned, compsReassigned] = await Promise.all([
    Event.updateMany({ organizer: uid }, { $set: { organizer: fallbackOwnerId } }),
    Competition.updateMany({ organizer: uid }, { $set: { organizer: fallbackOwnerId } }),
    FeedPost.updateMany({ author: uid }, { $set: { author: fallbackOwnerId } }),
    Club.updateMany({ admins: uid }, { $pull: { admins: uid } }),
    Club.updateMany({ createdBy: uid }, { $set: { createdBy: fallbackOwnerId } })
  ]);

  // 5. Delete User record itself
  await User.deleteOne({ _id: uid });

  return {
    deleted: true,
    deletedUser: {
      _id: uid.toString(),
      name: target.name,
      email: target.email,
      role: target.role,
      department: target.department || ''
    },
    cleanupStats: {
      registrationsDeleted: regDelRes.deletedCount || 0,
      eventsAttendeeCleared: attendeePullRes.modifiedCount || 0,
      assignmentsDeleted: assignDelRes.deletedCount || 0,
      paymentSessionsDeleted: youpiDelRes.deletedCount || 0,
      eventsReassigned: eventsReassigned.modifiedCount || 0,
      competitionsReassigned: compsReassigned.modifiedCount || 0
    }
  };
}

module.exports = { cascadeDeleteUser };

