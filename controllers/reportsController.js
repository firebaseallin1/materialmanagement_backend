const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Stock, Attendance, Measurement, Transport, Expense, Payment } = require('../models/Transactions');

const buildDateQuery = (from, to) => {
  const q = {};
  if (from) q.$gte = new Date(from);
  if (to) q.$lte = new Date(new Date(to).setHours(23, 59, 59));
  return Object.keys(q).length ? q : undefined;
};

// ── Stock Report ──────────────────────────────────────────────────────────────
exports.stockReport = async (req, res) => {
  try {
    const { branch, material, from, to, format } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (material) query.material = material;
    const dateQ = buildDateQuery(from, to);
    if (dateQ) query.date = dateQ;

    const data = await Stock.find(query)
      .populate('material', 'name unit code')
      .populate('branch', 'name')
      .sort({ date: -1 });

    if (format === 'excel') return exportExcel(res, 'Stock Report', ['Date', 'Branch', 'Material', 'Code', 'Unit', 'Type', 'Quantity', 'Remarks'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.material?.name, r.material?.code, r.material?.unit, r.type, r.quantity, r.remarks]));

    if (format === 'pdf') return exportPDF(res, 'Stock Report', ['Date', 'Branch', 'Material', 'Type', 'Qty'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.material?.name, r.type, r.quantity]));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Attendance Report ─────────────────────────────────────────────────────────
exports.attendanceReport = async (req, res) => {
  try {
    const { branch, employee, status, from, to, format } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (employee) query.employee = employee;
    if (status) query.status = status;
    const dateQ = buildDateQuery(from, to);
    if (dateQ) query.date = dateQ;

    const data = await Attendance.find(query)
      .populate('employee', 'name')
      .populate('branch', 'name')
      .sort({ date: -1 });

    if (format === 'excel') return exportExcel(res, 'Attendance Report', ['Date', 'Branch', 'Employee', 'Status', 'In Time', 'Out Time', 'Remarks'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.employee?.name, r.status, r.inTime, r.outTime, r.remarks]));

    if (format === 'pdf') return exportPDF(res, 'Attendance Report', ['Date', 'Branch', 'Employee', 'Status'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.employee?.name, r.status]));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Expense Report ────────────────────────────────────────────────────────────
exports.expenseReport = async (req, res) => {
  try {
    const { branch, from, to, format } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    const dateQ = buildDateQuery(from, to);
    if (dateQ) query.date = dateQ;

    const data = await Expense.find(query).populate('branch', 'name').populate('paidBy', 'name').sort({ date: -1 });
    const total = data.reduce((s, r) => s + r.amount, 0);

    if (format === 'excel') return exportExcel(res, 'Expense Report', ['Date', 'Branch', 'Category', 'Amount', 'Paid By', 'Description'],
      [...data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.category, r.amount, r.paidBy?.name, r.description]),
       ['', '', 'TOTAL', total, '', '']]);

    if (format === 'pdf') return exportPDF(res, 'Expense Report', ['Date', 'Branch', 'Category', 'Amount'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.category, r.amount]));

    res.json({ success: true, data, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Payment Report ────────────────────────────────────────────────────────────
exports.paymentReport = async (req, res) => {
  try {
    const { branch, type, from, to, format } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (type) query.type = type;
    const dateQ = buildDateQuery(from, to);
    if (dateQ) query.date = dateQ;

    const data = await Payment.find(query).populate('branch', 'name').sort({ date: -1 });

    if (format === 'excel') return exportExcel(res, 'Payment Report', ['Date', 'Branch', 'Party', 'Amount', 'Mode', 'Type', 'Reference'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.partyName, r.amount, r.paymentMode, r.type, r.referenceNo]));

    if (format === 'pdf') return exportPDF(res, 'Payment Report', ['Date', 'Party', 'Amount', 'Mode', 'Type'],
      data.map(r => [r.date?.toLocaleDateString(), r.partyName, r.amount, r.paymentMode, r.type]));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Transport Report ──────────────────────────────────────────────────────────
exports.transportReport = async (req, res) => {
  try {
    const { from, to, format } = req.query;
    const query = {};
    const dateQ = buildDateQuery(from, to);
    if (dateQ) query.date = dateQ;
    const data = await Transport.find(query)
      .populate('fromLocation toLocation', 'name')
      .populate('material', 'name')
      .sort({ date: -1 });

    if (format === 'excel') return exportExcel(res, 'Transport Report', ['Date', 'Vehicle', 'Driver', 'From', 'To', 'Material', 'Qty', 'Cost'],
      data.map(r => [r.date?.toLocaleDateString(), r.vehicleNo, r.driverName, r.fromLocation?.name, r.toLocation?.name, r.material?.name, r.quantity, r.cost]));

    if (format === 'pdf') return exportPDF(res, 'Transport Report', ['Date', 'Vehicle', 'From', 'To', 'Cost'],
      data.map(r => [r.date?.toLocaleDateString(), r.vehicleNo, r.fromLocation?.name, r.toLocation?.name, r.cost]));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Measurement Report ────────────────────────────────────────────────────────
exports.measurementReport = async (req, res) => {
  try {
    const { branch, material, from, to, format } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (material) query.material = material;
    const dateQ = buildDateQuery(from, to);
    if (dateQ) query.date = dateQ;
    const data = await Measurement.find(query)
      .populate('branch', 'name')
      .populate('material', 'name')
      .sort({ date: -1 });

    if (format === 'excel') return exportExcel(res, 'Measurement Report', ['Date', 'Branch', 'Material', 'L', 'B', 'H', 'Qty', 'Unit'],
      data.map(r => [r.date?.toLocaleDateString(), r.branch?.name, r.material?.name, r.length, r.breadth, r.height, r.quantity, r.unit]));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Export helpers ────────────────────────────────────────────────────────────
async function exportExcel(res, title, headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title);
  ws.addRow([title]);
  ws.mergeCells(1, 1, 1, headers.length);
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.addRow([]);
  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  rows.forEach(r => ws.addRow(r));
  ws.columns.forEach(col => { col.width = 18; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/ /g, '_')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function exportPDF(res, title, headers, rows) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/ /g, '_')}.pdf"`);
  doc.pipe(res);
  doc.fontSize(16).text(title, { align: 'center' }).moveDown();
  const colW = (doc.page.width - 60) / headers.length;
  const drawRow = (cells, bold = false) => {
    const y = doc.y;
    cells.forEach((cell, i) => {
      if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
      doc.fontSize(9).text(String(cell ?? ''), 30 + i * colW, y, { width: colW - 4, lineBreak: false });
    });
    doc.moveDown(1.2);
  };
  drawRow(headers, true);
  doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
  doc.moveDown(0.3);
  rows.forEach(r => drawRow(r));
  doc.end();
}
