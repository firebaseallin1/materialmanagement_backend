const express = require('express');
const router = express.Router();
const { Employee } = require('../models/Masters');
const { protect } = require('../middleware/auth');

// Helper: build base query — admin sees all, user sees only their own
const baseQuery = (req) =>
  req.user.role === 'admin' ? {} : { createdBy: req.user.id };

// GET /api/employees
router.get('/', protect, async (req, res) => {
  try {
    const { search, page = 1, limit = 50, isActive } = req.query;
    const query = { ...baseQuery(req) };
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { empCode: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Employee.find(query)
        .populate('branch', 'name')
        .populate('createdBy', 'name userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Employee.countDocuments(query),
    ]);
    res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/employees/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const doc = await Employee.findById(req.params.id)
      .populate('branch', 'name')
      .populate('createdBy', 'name userId');
    if (!doc) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (req.user.role !== 'admin' && String(doc.createdBy?._id ?? doc.createdBy) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/employees
router.post('/', protect, async (req, res) => {
  try {
    const doc = await Employee.create({ ...req.body, createdBy: req.user.id });
    const populated = await doc.populate('branch', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const existing = await Employee.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (req.user.role !== 'admin' && String(existing.createdBy) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const doc = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('branch', 'name')
      .populate('createdBy', 'name userId');
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/employees/:id  (soft delete)
router.delete('/:id', protect, async (req, res) => {
  try {
    const existing = await Employee.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (req.user.role !== 'admin' && String(existing.createdBy) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await Employee.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Employee deactivated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
