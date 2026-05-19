const { Attendance } = require('../models/Transactions');
const { Employee } = require('../models/Masters');

async function visibleEmployeeIds(req) {
  if (req.user.role === 'admin') return null;
  const emps = await Employee.find({ createdBy: req.user.id }, '_id');
  return emps.map(e => e._id);
}

exports.getAll = async (req, res) => {
  try {
    const { branch, employee, status, from, to, page = 1, limit = 50 } = req.query;
    const query = {};

    const allowedIds = await visibleEmployeeIds(req);
    if (allowedIds !== null) {
      query.employee = { $in: allowedIds };
    }

    if (branch) query.branch = branch;
    if (employee) {
      if (allowedIds !== null) {
        const reqId = employee;
        const ok = allowedIds.some(id => id.toString() === reqId);
        if (ok) query.employee = reqId;
      } else {
        query.employee = employee;
      }
    }
    if (status) query.status = status;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Attendance.find(query)
        .populate('employee', 'name empCode designation photo')
        .populate('branch', 'name')
        .sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Attendance.countDocuments(query),
    ]);
    res.json({ success: true, data, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const doc = await Attendance.findById(req.params.id).populate('employee branch createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { employee, date } = req.body;
    if (employee && date) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const exists = await Attendance.findOne({ employee, date: { $gte: dayStart, $lte: dayEnd } });
      if (exists) return res.status(400).json({ success: false, message: 'Attendance already marked for this employee on the selected date.' });
    }
    const doc = await Attendance.create({ ...req.body, createdBy: req.user.id });
    await doc.populate([{ path: 'employee', select: 'name empCode designation photo' }, { path: 'branch', select: 'name' }]);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('employee', 'name empCode designation photo')
      .populate('branch', 'name');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await Attendance.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/attendance/summary?branch=X&from=Y&to=Z
// Only shows attendance AFTER each employee's last paid periodTo.
// previousOutstanding comes from that last payment's thisWeekOutstanding.
exports.getSummary = async (req, res) => {
  try {
    const { branch, from, to } = req.query;
    const { Payment } = require('../models/Transactions');

    const fromDate = from ? new Date(from) : null;
    const toDateEnd = to ? new Date(to) : null;
    if (toDateEnd) toDateEnd.setHours(23, 59, 59, 999);

    // Scope employees
    let empQuery = { isActive: true };
    if (req.user.role !== 'admin') empQuery.createdBy = req.user.id;
    if (branch) empQuery.branch = branch;

    const employees = await Employee.find(empQuery)
      .populate('branch', 'name')
      .sort({ name: 1 });

    if (employees.length === 0) return res.json({ success: true, data: [] });

    const empIds = employees.map(e => e._id);

    // Most recent labor payment per employee — gives us lastPaidUntil, the payment's
    // createdAt timestamp, and previousOutstanding to carry forward.
    const lastPayments = await Payment.aggregate([
      {
        $match: {
          employee: { $in: empIds },
          type: 'paid',
          category: 'labor',
          periodTo: { $exists: true },
        },
      },
      { $sort: { periodTo: -1 } },
      {
        $group: {
          _id: '$employee',
          periodTo: { $first: '$periodTo' },
          thisWeekOutstanding: { $first: '$thisWeekOutstanding' },
          paidAt: { $first: '$createdAt' },   // when the payment was saved
        },
      },
    ]);

    // Map: employeeId → { lastPaidUntil (end of that day), paidAt, previousOutstanding }
    const lastPayMap = {};
    for (const p of lastPayments) {
      const endOfDay = new Date(p.periodTo);
      endOfDay.setHours(23, 59, 59, 999);
      lastPayMap[p._id.toString()] = {
        lastPaidUntil: endOfDay,
        paidAt: p.paidAt ? new Date(p.paidAt) : null,
        previousOutstanding: p.thisWeekOutstanding || 0,
      };
    }

    // All attendance in the requested range
    const attQuery = { employee: { $in: empIds } };
    if (branch) attQuery.branch = branch;
    if (fromDate || toDateEnd) {
      attQuery.date = {};
      if (fromDate) attQuery.date.$gte = fromDate;
      if (toDateEnd) attQuery.date.$lte = toDateEnd;
    }
    const records = await Attendance.find(attQuery);

    // Build per-employee totals.
    // A record is "paid" only when BOTH conditions are true:
    //   1. Its date falls within the last paid period  (date <= lastPaidUntil)
    //   2. It was created BEFORE the payment was saved (createdAt <= paidAt)
    // If attendance was added AFTER the payment was recorded (even on a date that
    // falls inside the paid period) it was never included in any payment amount,
    // so it must be treated as unpaid and shown here.
    const attMap = {};
    for (const r of records) {
      const key = r.employee.toString();
      const { lastPaidUntil, paidAt } = lastPayMap[key] || {};
      if (lastPaidUntil && r.date <= lastPaidUntil) {
        // Skip only if the record existed at or before the payment was saved
        if (!paidAt || r.createdAt <= paidAt) continue;
      }

      if (!attMap[key]) attMap[key] = { presentDays: 0, otHours: 0, earnings: 0 };
      if (r.isPresent) attMap[key].presentDays += 1;
      const ot = r.otHours || 0;
      const rate = r.hourRate || 0;
      attMap[key].otHours += ot;
      attMap[key].earnings += (r.isPresent ? 8 : 0) * rate + ot * rate;
    }

    const data = employees
      .map(emp => {
        const key = emp._id.toString();
        const att = attMap[key] || { presentDays: 0, otHours: 0, earnings: 0 };
        const previousOutstanding = lastPayMap[key]?.previousOutstanding || 0;
        return {
          _id: emp._id,
          name: emp.name,
          empCode: emp.empCode,
          designation: emp.designation,
          photo: emp.photo,
          branch: emp.branch,
          presentDays: att.presentDays,
          otHours: att.otHours,
          earnings: att.earnings,
          previousOutstanding,
        };
      })
      .filter(emp => emp.presentDays > 0 || emp.earnings > 0 || emp.previousOutstanding > 0);

    // If nothing to show, tell the client the next unpaid period start date
    // so it can auto-advance the date pickers.
    let nextPeriodFrom = null;
    if (data.length === 0 && lastPayments.length > 0) {
      const maxPaidUntil = lastPayments.reduce((max, p) => {
        const d = new Date(p.periodTo);
        return d > max ? d : max;
      }, new Date(0));
      const next = new Date(maxPaidUntil);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      nextPeriodFrom = next.toISOString();
    }

    res.json({ success: true, data, ...(nextPeriodFrom && { nextPeriodFrom }) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
