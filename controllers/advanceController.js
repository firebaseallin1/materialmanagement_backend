const { Advance, Attendance, Payment } = require('../models/Transactions');
const { Employee } = require('../models/Masters');
const User = require('../models/User');

// A user's employees: allocated to them on the Users screen, or created by them
async function userEmployeeIds(userId) {
  const [user, created] = await Promise.all([
    User.findById(userId).select('employees').lean(),
    Employee.find({ createdBy: userId }, '_id').lean(),
  ]);
  const ids = new Set([...(user?.employees || []), ...created.map(e => e._id)].map(String));
  return [...ids];
}

// Returns employee IDs visible to this request (null = no restriction).
// Admin sees all, or one user's employees with ?user=; a user sees only their own.
async function visibleEmployeeIds(req) {
  if (req.user.role === 'admin') return req.query.user ? userEmployeeIds(req.query.user) : null;
  return userEmployeeIds(req.user.id);
}

exports.getAll = async (req, res) => {
  try {
    const { branch, employee, type, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    // Old records have no type — they are advances given
    if (type === 'given') query.type = { $ne: 'returned' };
    else if (type === 'returned') query.type = 'returned';

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
    const [docs, total] = await Promise.all([
      Advance.find(query)
        .populate({
          path: 'employee',
          select: 'name empCode designation createdBy',
          populate: { path: 'createdBy', select: 'name userId role' },
        })
        .populate('branch', 'name')
        .sort({ date: -1 }).skip(skip).limit(Number(limit))
        .lean(),
      Advance.countDocuments(query),
    ]);

    // Tag each advance with the user the employee belongs to (allocation first,
    // else the non-admin user who created the employee)
    const empIds = docs.map(d => d.employee?._id).filter(Boolean);
    const owners = await User.find({ employees: { $in: empIds } }).select('name userId employees').lean();
    const ownerOf = {};
    for (const u of owners) {
      for (const e of u.employees || []) {
        (ownerOf[String(e)] = ownerOf[String(e)] || []).push({ _id: u._id, name: u.name, userId: u.userId });
      }
    }
    const data = docs.map(d => {
      const emp = d.employee;
      let users = emp ? ownerOf[String(emp._id)] || [] : [];
      if (!users.length && emp?.createdBy && emp.createdBy.role !== 'admin') {
        users = [{ _id: emp.createdBy._id, name: emp.createdBy.name, userId: emp.createdBy.userId }];
      }
      return { ...d, users };
    });
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
    const emp = await Employee.findById(req.body.employee).select('branch createdBy');
    // Non-admin: verify they created this employee
    if (req.user.role !== 'admin' && (!emp || emp.createdBy?.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied to this employee' });
    }
    const branch = req.body.branch || emp?.branch;
    const doc = await Advance.create({ ...req.body, branch, createdBy: req.user.id });
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
    const update = { ...req.body };
    // Employee changed — follow the new employee's branch
    if (update.employee && update.employee !== existing.employee?.toString() && !update.branch) {
      const emp = await Employee.findById(update.employee).select('branch');
      if (emp?.branch) update.branch = emp.branch;
    }
    const doc = await Advance.findByIdAndUpdate(req.params.id, update, { new: true })
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

// Per-employee outstanding: advance given minus advance returned and payment adjustments
exports.getBalance = async (req, res) => {
  try {
    const { employee } = req.query;
    if (!employee) return res.status(400).json({ success: false, message: 'employee id required' });

    const [advances, payments] = await Promise.all([
      Advance.find({ employee }),
      Payment.find({ employee }),
    ]);

    const isReturn = (a) => a.type === 'returned';
    const totalAdvances = advances.filter(a => !isReturn(a)).reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalReturned = advances.filter(isReturn).reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalAdvanceAdjusted = payments.reduce((sum, p) => sum + (p.advanceAdjustment || 0), 0);

    res.json({
      success: true,
      totalAdvances,
      totalReturned,
      totalPaid,
      totalAdvanceAdjusted,
      advanceBalance: totalAdvances - totalReturned - totalAdvanceAdjusted,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
