const fs = require('fs');
const path = require('path');
const Event = require('../../models/events/Event');
const Registration = require('../../models/events/Registration');
const Competition = require('../../models/competitions/Competition');
const AssessmentAssignment = require('../../models/competitions/AssessmentAssignment');
const Notification = require('../../models/community/Notification');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiWebhookReceipt = require('../../models/payments/YoupiWebhookReceipt');
const YoupiStatementLine = require('../../models/payments/YoupiStatementLine');
const SystemSetting = require('../../models/system/SystemSetting');
const { promoteNext, reindexQueue, normalizeReceivingAccountId } = require('../payments/youpiGatewayService');
const { computeEventLifecycle, cleanupFeedForEvent } = require('../feed/feedService');

function removeLocalUploadIfExists(relPath) {
  if (relPath && typeof relPath === 'string' && relPath.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', '..', relPath);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Could not remove local upload:', err.message);
      }
    }
  }
}

/**
 * Deletes an event and all associated cloud database records (competitions,
 * assignments, registrations, YouPI sessions & webhook receipts, notifications,
 * campus feed posts/likes/saves/comments, and local/legacy uploads).
 */
async function cascadeDeleteEvent(eventDocOrId) {
  const eventDoc =
    eventDocOrId && typeof eventDocOrId === 'object' && eventDocOrId._id
      ? eventDocOrId
      : await Event.findById(eventDocOrId);

  if (!eventDoc) {
    return {
      deleted: false,
      deletedCompetitionsCount: 0,
      deletedRegistrationsCount: 0,
      deletedSessionsCount: 0
    };
  }

  const eventId = eventDoc._id;

  // 1. Competitions & participant assignments
  const linkedComps = await Competition.find({ event: eventId }).select('_id').lean();
  let deletedCompetitionsCount = 0;
  if (linkedComps.length > 0) {
    const compIds = linkedComps.map(c => c._id);
    await AssessmentAssignment.deleteMany({ competition: { $in: compIds } });
    const compDel = await Competition.deleteMany({ _id: { $in: compIds } });
    deletedCompetitionsCount = compDel.deletedCount || compIds.length;
  }

  // 2. YouPI sessions, webhook receipts & statement line links
  const sessions = await YoupiPaymentSession.find({ event: eventId })
    .select('_id paymentId orderId receivingAccountId payeeVpa slotLockActive status')
    .lean();
  let deletedSessionsCount = 0;
  if (sessions.length > 0) {
    const sessionObjIds = sessions.map(s => s._id);
    const paymentIds = sessions.map(s => s.paymentId).filter(Boolean);
    const orderIds = sessions.map(s => s.orderId).filter(Boolean);
    const affectedRecAccounts = Array.from(
      new Set(
        sessions
          .filter(s => s.slotLockActive || s.status === 'QUEUED')
          .map(s => s.receivingAccountId || normalizeReceivingAccountId(s.payeeVpa))
          .filter(Boolean)
      )
    );
    await YoupiStatementLine.updateMany(
      { paymentSessionId: { $in: sessionObjIds } },
      { $set: { paymentSessionId: null } }
    ).catch(() => {});
    if (paymentIds.length > 0 || orderIds.length > 0) {
      await YoupiWebhookReceipt.deleteMany({
        $or: [
          ...(paymentIds.length > 0 ? [{ paymentId: { $in: paymentIds } }] : []),
          ...(orderIds.length > 0 ? [{ orderId: { $in: orderIds } }] : [])
        ]
      });
    }
    const sessDel = await YoupiPaymentSession.deleteMany({ event: eventId });
    deletedSessionsCount = sessDel.deletedCount || sessions.length;
    for (const recAcc of affectedRecAccounts) {
      await promoteNext(recAcc).catch(() => {});
      await reindexQueue(recAcc).catch(() => {});
    }
  }

  // 3. Registrations & notifications
  const regDel = await Registration.deleteMany({ event: eventId });
  await Notification.deleteMany({ relatedEvent: eventId });

  // 4. Campus feed posts, likes, saves, and comments
  await cleanupFeedForEvent(eventId);

  // 5. Legacy local photo cleanup (embedded base64 photos live inside Event doc and get wiped on deleteOne)
  removeLocalUploadIfExists(eventDoc.photo);

  // 6. Delete event document from cloud MongoDB
  await Event.deleteOne({ _id: eventId });

  return {
    deleted: true,
    eventId: eventId.toString(),
    title: eventDoc.title,
    deletedCompetitionsCount,
    deletedRegistrationsCount: regDel.deletedCount || 0,
    deletedSessionsCount
  };
}

async function getCleanupPolicy() {
  let doc = await SystemSetting.findOne({ key: 'global' });
  if (!doc) {
    const defaultAuto = String(process.env.AUTO_DELETE_EXPIRED_EVENTS || 'false').toLowerCase() === 'true';
    const rawHours = Number(process.env.EXPIRED_EVENT_RETENTION_HOURS ?? 24);
    const defaultHours = Number.isFinite(rawHours) ? Math.max(0, Math.min(720, rawHours)) : 24;
    doc = await SystemSetting.create({
      key: 'global',
      autoDeleteExpiredEvents: defaultAuto,
      expiredEventGraceHours: defaultHours
    });
  }
  return doc;
}

async function updateCleanupPolicy({ autoDeleteExpiredEvents, expiredEventGraceHours } = {}) {
  const policy = await getCleanupPolicy();
  if (autoDeleteExpiredEvents !== undefined) {
    policy.autoDeleteExpiredEvents = Boolean(autoDeleteExpiredEvents);
  }
  if (expiredEventGraceHours !== undefined) {
    const hours = Number(expiredEventGraceHours);
    if (Number.isFinite(hours)) {
      policy.expiredEventGraceHours = Math.max(0, Math.min(720, hours));
    }
  }
  await policy.save();
  return policy;
}

/**
 * Finds expired events eligible for cleanup.
 * @param {object} opts
 * @param {number|null} opts.graceHours
 * @param {boolean} opts.forceAllExpired - If true (manual purge), ignores global toggle and per-event 'never' skip unless specified
 * @param {Date} opts.now
 */
async function evaluateExpiredEvents({ graceHours = null, now = new Date(), includeProtected = false } = {}) {
  const policy = await getCleanupPolicy();
  const effectiveGraceHours = graceHours !== null && graceHours !== undefined
    ? Math.max(0, Number(graceHours) || 0)
    : Number(policy.expiredEventGraceHours || 0);

  const cutoffMs = now.getTime() - effectiveGraceHours * 60 * 60 * 1000;
  const allEvents = await Event.find({}).select('title date time status autoDeleteWhenExpired photo createdAt');

  const allExpired = [];
  const eligibleAutoDelete = [];

  for (const ev of allEvents) {
    const lc = computeEventLifecycle(ev, now);
    if (!lc.isExpired) continue;

    allExpired.push({ event: ev, lifecycle: lc });

    const endsAtMs = lc.endsAt ? new Date(lc.endsAt).getTime() : 0;
    const pastGrace = endsAtMs <= cutoffMs;
    const rule = ev.autoDeleteWhenExpired || 'inherit';

    if (includeProtected) {
      if (pastGrace) eligibleAutoDelete.push(ev);
      continue;
    }

    if (rule === 'never') continue;

    if (rule === 'always') {
      if (pastGrace) eligibleAutoDelete.push(ev);
    } else if (policy.autoDeleteExpiredEvents && pastGrace) {
      eligibleAutoDelete.push(ev);
    }
  }

  return {
    policy,
    effectiveGraceHours,
    totalExpiredCount: allExpired.length,
    expiredEvents: allExpired.map(({ event, lifecycle }) => ({
      _id: event._id,
      title: event.title,
      date: event.date,
      time: event.time,
      status: event.status,
      autoDeleteWhenExpired: event.autoDeleteWhenExpired || 'inherit',
      endsAt: lifecycle.endsAt
    })),
    eligibleEvents: eligibleAutoDelete
  };
}

/**
 * Deletes expired events from MongoDB Cloud and associated records.
 */
async function purgeExpiredEvents({
  forceAllExpired = false,
  graceHoursOverride = null,
  now = new Date()
} = {}) {
  const {
    policy,
    effectiveGraceHours,
    totalExpiredCount,
    eligibleEvents
  } = await evaluateExpiredEvents({
    graceHours: graceHoursOverride,
    now,
    includeProtected: forceAllExpired
  });

  // For manual "Purge Expired Now", delete all currently expired events (even if auto-delete policy is disabled),
  // unless an event explicitly requested autoDeleteWhenExpired='never' (unless graceHoursOverride===0? Wait: manual purge lets Admin purge all expired or respect 'never'? Let's purge all expired when forceAllExpired=true!)
  let targets = eligibleEvents;
  if (forceAllExpired) {
    const { expiredEvents } = await evaluateExpiredEvents({
      graceHours: graceHoursOverride !== null ? graceHoursOverride : 0,
      now,
      includeProtected: true
    });
    const ids = expiredEvents.map(e => e._id);
    targets = ids.length > 0 ? await Event.find({ _id: { $in: ids } }) : [];
  }

  const deletedResults = [];
  for (const ev of targets) {
    const result = await cascadeDeleteEvent(ev);
    if (result.deleted) {
      deletedResults.push(result);
    }
  }

  if (deletedResults.length > 0 || forceAllExpired) {
    policy.lastCleanupAt = now;
    policy.lastDeletedCount = deletedResults.length;
    policy.lastDeletedTitles = deletedResults.map(r => r.title).slice(0, 20);
    await policy.save();
  }

  return {
    deletedCount: deletedResults.length,
    deletedEvents: deletedResults,
    totalExpiredRemaining: Math.max(0, totalExpiredCount - deletedResults.length),
    effectiveGraceHours,
    policy
  };
}

function startExpiredEventScheduler(intervalMs = 15 * 60 * 1000) {
  const runScheduled = async () => {
    try {
      const res = await purgeExpiredEvents({ forceAllExpired: false });
      if (res.deletedCount > 0) {
        console.log(
          `[CloudCleanup] Auto-deleted ${res.deletedCount} expired event(s) from MongoDB cloud: ${res.deletedEvents
            .map(e => e.title)
            .join(', ')}`
        );
      }
    } catch (err) {
      console.warn('[CloudCleanup] Scheduled sweep warning:', err.message);
    }
  };

  const bootTimer = setTimeout(runScheduled, 20 * 1000);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();

  const timer = setInterval(runScheduled, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  removeLocalUploadIfExists,
  cascadeDeleteEvent,
  getCleanupPolicy,
  updateCleanupPolicy,
  evaluateExpiredEvents,
  purgeExpiredEvents,
  startExpiredEventScheduler
};

