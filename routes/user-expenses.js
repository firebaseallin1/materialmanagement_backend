const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { UserExpense, Attendance, Payment } = require('../models/Transactions');
const User = require('../models/User');

// Same date handling as attendanceController: use the YYYY-MM-DD part as a UTC day
const utcDay = (str, end = false) => {
  const d = String(str).substring(0, 10);
  return new Date(d + (end ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
};

// Non-admin users can only see / change their own account
const targetUserId = (req) =>
  req.user.role === 'admin' && req.query.user ? req.query.user : req.user.id;

const dateRange = (from, to) => {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = utcDay(from);
  if (to) range.$lte = utcDay(to, true);
  return range;
};

// Same formula as the Attendance screen: (8h if present + OT hours) × rate
const attAmount = (a) => ((a.isPresent ? 8 : 0) + (a.otHours || 0)) * (a.hourRate || 0);
const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);

// A user payment belongs to the week it settles (periodTo), else its payment date
const payDay = (p) => (p.periodTo || p.date).toISOString().substring(0, 10);

// User credit starts from this date — attendance, expenses and payments before it
// are not counted (no pending is carried from before the concept started).
const CREDIT_START = process.env.USER_CREDIT_START || '2026-10-18';

// GET /api/user-expenses/ledger?user=&from=&to=
// Per-user credit for a period:
//   previousPending (everything before `from`)
//   + attendance amount of the user's allocated employees
//   + expenses paid by the user
//   − payments made to the user
//   = pending
router.get('/ledger', protect, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to are required' });
    const userId = targetUserId(req);
    const user = await User.findById(userId).select('name userId employees').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Nothing before CREDIT_START is counted, in the period or in previous pending
    const creditStart = utcDay(CREDIT_START);
    const reqFrom = String(from).substring(0, 10);
    const fromStr = reqFrom < CREDIT_START ? CREDIT_START : reqFrom;
    const toStr = String(to).substring(0, 10);
    const start = utcDay(fromStr);
    const end = utcDay(toStr, true);
    const empIds = user.employees || [];

    const [attBefore, attendance, expBefore, expenses, allPayments] = await Promise.all([
      empIds.length
        ? Attendance.find({ employee: { $in: empIds }, date: { $gte: creditStart, $lt: start } })
            .select('isPresent otHours hourRate').lean()
        : [],
      empIds.length
        ? Attendance.find({ employee: { $in: empIds }, date: { $gte: utcDay(reqFrom), $lte: end } })
            .populate('employee', 'name empCode photo')
            .populate('branch', 'name')
            .sort({ date: 1 })
            .lean()
        : [],
      UserExpense.find({ user: userId, date: { $gte: creditStart, $lt: start } }).select('amount').lean(),
      UserExpense.find({ user: userId, date: { $gte: start, $lte: end } })
        .populate('branch', 'name').sort({ date: 1 }).lean(),
      Payment.find({ category: 'user', type: 'paid', user: userId }).sort({ date: 1 }).lean(),
    ]);

    const payments = allPayments.filter((p) => payDay(p) >= CREDIT_START);
    const paidBefore = payments.filter((p) => payDay(p) < fromStr);
    const paidInPeriod = payments.filter((p) => payDay(p) >= fromStr && payDay(p) <= toStr);

    const previousPending =
      sum(attBefore, attAmount) + sum(expBefore, (e) => e.amount || 0) - sum(paidBefore, (p) => p.amount || 0);
    // Records before CREDIT_START are still listed, but not counted in the credit
    const attendanceTotal = sum(attendance.filter((a) => a.date >= creditStart), attAmount);
    const expenseTotal = sum(expenses, (e) => e.amount || 0);
    const paidTotal = sum(paidInPeriod, (p) => p.amount || 0);
    const total = previousPending + attendanceTotal + expenseTotal;

    res.json({
      success: true,
      data: {
        user: { _id: user._id, name: user.name, userId: user.userId },
        attendance,
        expenses,
        payments: paidInPeriod,
        previousPending,
        attendanceTotal,
        expenseTotal,
        total,
        paidTotal,
        pending: total - paidTotal,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user-expenses/pay — admin records a payment made to a user
router.post('/pay', protect, adminOnly, async (req, res) => {
  try {
    const { user: userId, amount, paymentMode = 'cash', date, periodFrom, periodTo, description, referenceNo } = req.body;
    if (!userId || !(Number(amount) > 0))
      return res.status(400).json({ success: false, message: 'User and a valid amount are required' });
    const user = await User.findById(userId).select('name userId');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const doc = await Payment.create({
      partyName: `${user.name} (${user.userId})`,
      user: user._id,
      amount: Number(amount),
      paymentMode,
      date: date ? utcDay(date) : new Date(),
      periodFrom: periodFrom ? utcDay(periodFrom) : undefined,
      periodTo: periodTo ? utcDay(periodTo, true) : undefined,
      description,
      referenceNo,
      type: 'paid',
      category: 'user',
      createdBy: req.user.id,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/user-expenses/pay/:id — admin removes a wrong user payment
router.delete('/pay/:id', protect, adminOnly, async (req, res) => {
  try {
    const doc = await Payment.findOneAndDelete({ _id: req.params.id, category: 'user' });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user-expenses?user=&from=&to=
router.get('/', protect, async (req, res) => {
  try {
    const query = { user: targetUserId(req) };
    const range = dateRange(req.query.from, req.query.to);
    if (range) query.date = range;
    const data = await UserExpense.find(query).populate('branch', 'name').sort({ date: -1 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user-expenses — always saved against the logged-in user
router.post('/', protect, async (req, res) => {
  try {
    const { user, createdBy, ...body } = req.body;
    const owner = req.user.role === 'admin' && user ? user : req.user.id;
    const doc = await UserExpense.create({ ...body, user: owner, createdBy: req.user.id });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

const findOwned = async (req) => {
  const doc = await UserExpense.findById(req.params.id);
  if (!doc) return { status: 404, message: 'Not found' };
  if (req.user.role !== 'admin' && String(doc.user) !== String(req.user.id))
    return { status: 403, message: 'You can only change your own expenses' };
  return { doc };
};

router.put('/:id', protect, async (req, res) => {
  try {
    const { doc, status, message } = await findOwned(req);
    if (!doc) return res.status(status).json({ success: false, message });
    const { user, createdBy, ...body } = req.body;
    Object.assign(doc, body);
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const { doc, status, message } = await findOwned(req);
    if (!doc) return res.status(status).json({ success: false, message });
    await doc.deleteOne();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
