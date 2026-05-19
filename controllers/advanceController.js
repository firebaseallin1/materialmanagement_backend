const { Advance, Attendance, Payment } = require('../models/Transactions');
const { Employee } = require('../models/Masters');

// Returns employee IDs visible to this user (admin = all, user = created by them)
async function visibleEmployeeIds(req) {
  if (req.user.role === 'admin') return null; // null = no restriction
  const emps = await Employee.find({ createdBy: req.user.id }, '_id');
  return emps.map(e => e._id);
}

exports.getAll = async (req, res) => {
  try {
    const { branch, employee, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch) query.branch = branch;

    // Scope to visible employees for non-admin
    const allowedIds = await visibleEmployeeIds(req);
    if (allowedIds !== null) {
      query.employee = employee
        ? (allowedIds.some(id => id.toString() === employee) ? employee : null)
        : { $in: allowedIds };
      if (query.employee === null) {
        return res.json({ success: true, data: [], total: 0 });
      }
    } else if (employee) {
      query.employee = employee;
    }

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Advance.find(query)
        .populate('employee', 'name empCode designation')
        .populate('branch', 'name')
        .sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Advance.countDocuments(query),
    ]);
    res.json({ success: true, data, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const doc = await Advance.findById(req.params.id)
      .populate('employee', 'name empCode designation')
      .populate('branch createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    // Non-admin: verify they created this employee
    if (req.user.role !== 'admin') {
      const emp = await Employee.findById(req.body.employee);
      if (!emp || emp.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied to this employee' });
      }
    }
    const doc = await Advance.create({ ...req.body, createdBy: req.user.id });
    await doc.populate([
      { path: 'employee', select: 'name empCode designation' },
      { path: 'branch', select: 'name' },
    ]);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await Advance.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role !== 'admin' && existing.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const doc = await Advance.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('employee', 'name empCode designation')
      .populate('branch', 'name');
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const existing = await Advance.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role !== 'admin' && existing.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await Advance.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Per-employee outstanding: total advance given minus advance adjustments from payments
exports.getBalance = async (req, res) => {
  try {
    const { employee } = req.query;
    if (!employee) return res.status(400).json({ success: false, message: 'employee id required' });

    const [advances, payments] = await Promise.all([
      Advance.find({ employee }),
      Payment.find({ employee }),
    ]);

    const totalAdvances = advances.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalAdvanceAdjusted = payments.reduce((sum, p) => sum + (p.advanceAdjustment || 0), 0);

    res.json({
      success: true,
      totalAdvances,
      totalPaid,
      totalAdvanceAdjusted,
      advanceBalance: totalAdvances - totalAdvanceAdjusted,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
