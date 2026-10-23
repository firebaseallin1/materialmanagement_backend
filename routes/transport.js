const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/transportController');
const { protect } = require('../middleware/auth');
const mongoose = require('mongoose');
const { Transport, Payment } = require('../models/Transactions');
const { Branch } = require('../models/Masters');

// GET /api/transport/payment-summary?from=Y&to=Z&branch=X
// Same createdAt-based logic as attendance/summary:
//   - previousOutstanding comes from the last payment's thisWeekOutstanding
//   - records already covered by a payment (date <= lastPaidUntil AND createdAt <= paidAt) are excluded
//   - returns nextPeriodFrom when nothing to show so the client can auto-advance
router.get('/payment-summary', protect, async (req, res) => {
  try {
    const { from, to, branch } = req.query;

    const fromDate = from ? new Date(from) : null;
    const toDateEnd = to ? new Date(to) : null;
    if (toDateEnd) toDateEnd.setHours(23, 59, 59, 999);

    const baseMatch = {};
    if (req.user.role !== 'admin') {
      baseMatch.createdBy = new mongoose.Types.ObjectId(req.user.id);
    }

    // Branch filter: resolve branch → location
    if (branch) {
      const branchDoc = await Branch.findById(branch).select('location');
      if (branchDoc && branchDoc.location) {
        const locId = branchDoc.location;
        baseMatch.$or = [{ fromLocation: locId }, { toLocation: locId }];
      }
    }

    // All transport records in the requested period
    const rangeMatch = { ...baseMatch };
    if (fromDate || toDateEnd) {
      rangeMatch.date = {};
      if (fromDate) rangeMatch.date.$gte = fromDate;
      if (toDateEnd) rangeMatch.date.$lte = toDateEnd;
    }
    const allRecords = await Transport.find(rangeMatch).lean();

    // Unique vehicle numbers in this period
    const vehicleNos = [...new Set(allRecords.map(r => r.vehicleNo))];
    if (vehicleNos.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Most recent transport payment per vehicle (by vehicleNo field)
    const lastPayments = await Payment.aggregate([
      {
        $match: {
          type: 'paid',
          category: 'transport',
          vehicleNo: { $in: vehicleNos },
          periodTo: { $exists: true },
        },
      },
      { $sort: { periodTo: -1 } },
      {
        $group: {
          _id: '$vehicleNo',
          periodTo: { $first: '$periodTo' },
          thisWeekOutstanding: { $first: '$thisWeekOutstanding' },
          paidAt: { $first: '$createdAt' },
        },
      },
    ]);

    // Map: vehicleNo → { lastPaidUntil, paidAt, previousOutstanding }
    const lastPayMap = {};
    for (const p of lastPayments) {
      const endOfDay = new Date(p.periodTo);
      endOfDay.setHours(23, 59, 59, 999);
      lastPayMap[p._id] = {
        lastPaidUntil: endOfDay,
        paidAt: p.paidAt ? new Date(p.paidAt) : null,
        previousOutstanding: p.thisWeekOutstanding || 0,
      };
    }

    // Build per-vehicle totals, skipping already-paid records
    const vehicleMap = {};
    for (const r of allRecords) {
      const vno = r.vehicleNo;
      const { lastPaidUntil, paidAt } = lastPayMap[vno] || {};
      if (lastPaidUntil && r.date <= lastPaidUntil) {
        if (!paidAt || r.createdAt <= paidAt) continue; // already paid
      }
      if (!vehicleMap[vno]) {
        vehicleMap[vno] = {
          vehicleNo: vno,
          driverName: r.driverName,
          trips: 0,
          currentCost: 0,
          previousOutstanding: lastPayMap[vno]?.previousOutstanding || 0,
        };
      }
      vehicleMap[vno].trips += 1;
      vehicleMap[vno].currentCost += r.cost || 0;
    }

    const data = Object.values(vehicleMap)
      .filter(v => v.currentCost > 0 || v.previousOutstanding > 0)
      .sort((a, b) => a.driverName.localeCompare(b.driverName));

    // Suggest next period if nothing to show
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
});

router.get('/', protect, ctrl.getAll);
router.get('/:id', protect, ctrl.getOne);
router.post('/', protect, ctrl.create);
router.put('/:id', protect, ctrl.update);
router.delete('/:id', protect, ctrl.remove);
module.exports = router;
