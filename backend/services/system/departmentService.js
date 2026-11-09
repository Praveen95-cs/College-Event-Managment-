const Department = require('../../models/system/Department');
const User = require('../../models/auth/User');
const Event = require('../../models/events/Event');
const Club = require('../../models/feed/Club');
const { sanitizePlainText } = require('../../utils/sanitize');

const DEFAULT_DEPARTMENTS = [
  { name: 'Computer Science', code: 'CS' },
  { name: 'Computer Technology', code: 'CT' },
  { name: 'Information Technology', code: 'IT' },
  { name: 'Electronics', code: 'ECE' },
  { name: 'Mechanical', code: 'MECH' },
  { name: 'Civil', code: 'CIVIL' }
];

function createDeptError(message, status = 400, code = 'DEPARTMENT_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function cleanDepartmentName(raw) {
  return sanitizePlainText(String(raw || ''), 100).replace(/\s+/g, ' ').trim();
}

function cleanDepartmentCode(raw) {
  return sanitizePlainText(String(raw || ''), 20).toUpperCase().replace(/\s+/g, '');
}

async function ensureDefaultDepartments() {
  const count = await Department.countDocuments();
  if (count > 0) return;

  await Department.insertMany(
    DEFAULT_DEPARTMENTS.map(d => ({
      name: d.name,
      normalizedName: d.name.toLowerCase(),
      code: d.code,
      isActive: true
    })),
    { ordered: false }
  ).catch(() => {});
}

async function listDepartments({ includeInactive = false, includeStats = false } = {}) {
  await ensureDefaultDepartments();

  const filter = includeInactive ? {} : { isActive: true };
  const rows = await Department.find(filter).sort({ isActive: -1, name: 1 }).lean();

  if (!includeStats) {
    return rows.map(d => ({
      _id: d._id,
      name: d.name,
      code: d.code || '',
      isActive: d.isActive !== false
    }));
  }

  const [userCounts, eventCounts] = await Promise.all([
    User.aggregate([{ $group: { _id: { $toLower: '$department' }, count: { $sum: 1 } } }]),
    Event.aggregate([{ $group: { _id: { $toLower: '$department' }, count: { $sum: 1 } } }])
  ]);

  const userMap = new Map(userCounts.map(x => [String(x._id || '').trim(), x.count]));
  const eventMap = new Map(eventCounts.map(x => [String(x._id || '').trim(), x.count]));

  return rows.map(d => ({
    _id: d._id,
    name: d.name,
    code: d.code || '',
    isActive: d.isActive !== false,
    usersCount: userMap.get(d.normalizedName) || 0,
    eventsCount: eventMap.get(d.normalizedName) || 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt
  }));
}

async function resolveActiveDepartmentName(inputName) {
  const clean = cleanDepartmentName(inputName);
  if (!clean) return null;
  await ensureDefaultDepartments();
  const doc = await Department.findOne({
    normalizedName: clean.toLowerCase(),
    isActive: true
  })
    .select('name')
    .lean();
  return doc ? doc.name : null;
}

async function createDepartment({ name, code = '', isActive = true, adminId = null }) {
  const cleanName = cleanDepartmentName(name);
  if (!cleanName || cleanName.length < 2) {
    throw createDeptError('Department name must be at least 2 characters.', 400, 'INVALID_DEPARTMENT_NAME');
  }
  const cleanCode = cleanDepartmentCode(code);
  const existing = await Department.findOne({ normalizedName: cleanName.toLowerCase() });
  if (existing) {
    throw createDeptError(`Department "${existing.name}" already exists.`, 409, 'DUPLICATE_DEPARTMENT');
  }

  const doc = await Department.create({
    name: cleanName,
    normalizedName: cleanName.toLowerCase(),
    code: cleanCode,
    isActive: isActive !== false,
    createdBy: adminId || null
  });
  return doc.toObject();
}

async function updateDepartment(deptId, { name, code, isActive } = {}) {
  const doc = await Department.findById(deptId);
  if (!doc) {
    throw createDeptError('Department not found.', 404, 'DEPARTMENT_NOT_FOUND');
  }

  const previousName = doc.name;
  let renamed = false;

  if (name !== undefined) {
    const cleanName = cleanDepartmentName(name);
    if (!cleanName || cleanName.length < 2) {
      throw createDeptError('Department name must be at least 2 characters.', 400, 'INVALID_DEPARTMENT_NAME');
    }
    if (cleanName.toLowerCase() !== doc.normalizedName) {
      const conflict = await Department.findOne({
        _id: { $ne: doc._id },
        normalizedName: cleanName.toLowerCase()
      });
      if (conflict) {
        throw createDeptError(`Another department named "${conflict.name}" already exists.`, 409, 'DUPLICATE_DEPARTMENT');
      }
    }
    if (cleanName !== previousName) {
      doc.name = cleanName;
      doc.normalizedName = cleanName.toLowerCase();
      renamed = true;
    }
  }

  if (code !== undefined) {
    doc.code = cleanDepartmentCode(code);
  }

  if (isActive !== undefined) {
    doc.isActive = Boolean(isActive);
  }

  await doc.save();

  const cascadeCounts = { usersUpdated: 0, eventsUpdated: 0, clubsUpdated: 0 };
  if (renamed) {
    const rx = new RegExp(`^${previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const [uRes, eRes, cRes] = await Promise.all([
      User.updateMany({ department: rx }, { $set: { department: doc.name } }),
      Event.updateMany({ department: rx }, { $set: { department: doc.name } }),
      Club.updateMany({ department: rx }, { $set: { department: doc.name } })
    ]);
    cascadeCounts.usersUpdated = uRes.modifiedCount || 0;
    cascadeCounts.eventsUpdated = eRes.modifiedCount || 0;
    cascadeCounts.clubsUpdated = cRes.modifiedCount || 0;
  }

  return {
    department: doc.toObject(),
    renamed,
    previousName,
    cascadeCounts
  };
}

async function deleteDepartment(deptId) {
  const doc = await Department.findById(deptId);
  if (!doc) {
    throw createDeptError('Department not found.', 404, 'DEPARTMENT_NOT_FOUND');
  }
  const activeRemaining = await Department.countDocuments({ _id: { $ne: doc._id }, isActive: true });
  if (doc.isActive && activeRemaining === 0) {
    throw createDeptError(
      'Cannot delete the last active department. Create or activate another department first.',
      400,
      'LAST_ACTIVE_DEPARTMENT'
    );
  }

  await Department.deleteOne({ _id: doc._id });
  return { deleted: true, _id: doc._id.toString(), name: doc.name };
}

module.exports = {
  DEFAULT_DEPARTMENTS,
  ensureDefaultDepartments,
  listDepartments,
  resolveActiveDepartmentName,
  createDepartment,
  updateDepartment,
  deleteDepartment
};

