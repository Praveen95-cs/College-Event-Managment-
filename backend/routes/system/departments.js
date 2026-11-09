const router = require('express').Router();
const mongoose = require('mongoose');
const { auth, optionalAuth, authorize } = require('../../middleware/auth');
const {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment
} = require('../../services/system/departmentService');

// Publicly lists active admin-configured departments (students/organizers/signup).
// Admin callers can pass includeInactive=true & includeStats=true to manage departments.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const includeInactive = isAdmin && String(req.query.includeInactive || '').toLowerCase() === 'true';
    const includeStats = isAdmin && String(req.query.includeStats || '').toLowerCase() === 'true';

    const departments = await listDepartments({ includeInactive, includeStats });
    res.json(departments);
  } catch (err) {
    console.error('Error loading departments:', err);
    res.status(500).json({ message: 'Failed to load departments' });
  }
});

// Admin-only: add a new department
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const created = await createDepartment({
      name: req.body.name,
      code: req.body.code,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      adminId: req.user._id
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'DEPARTMENT_CREATE_FAILED',
      message: err.message || 'Failed to add department'
    });
  }
});

// Admin-only: modify department name / code / active visibility (cascades rename across users, events & clubs)
async function handleUpdateDepartment(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Department not found' });
    }
    const result = await updateDepartment(req.params.id, {
      name: req.body.name,
      code: req.body.code,
      isActive: req.body.isActive
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'DEPARTMENT_UPDATE_FAILED',
      message: err.message || 'Failed to update department'
    });
  }
}

router.put('/:id', auth, authorize('admin'), handleUpdateDepartment);
router.patch('/:id', auth, authorize('admin'), handleUpdateDepartment);

// Admin-only: delete department
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Department not found' });
    }
    const result = await deleteDepartment(req.params.id);
    res.json({
      message: `Department "${result.name}" deleted.`,
      ...result
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'DEPARTMENT_DELETE_FAILED',
      message: err.message || 'Failed to delete department'
    });
  }
});

module.exports = router;

