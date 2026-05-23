const mongoose = require('mongoose');

// Material Stock
const stockSchema = new mongoose.Schema({
  material:        { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  branch:          { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',   required: true },
  type:            { type: String, enum: ['in', 'out'], required: true },
  quantity:        { type: Number, required: true, min: 0 },
  date:            { type: Date, required: true, default: Date.now },
  remarks:         { type: String },
  // 'store' = initial stock addition, 'stock_move' = inter-branch transfer
  transactionType: { type: String, enum: ['store', 'stock_move'], default: 'store' },
  // For stock_move: source and destination branches
  fromBranch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  toBranch:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  // Links the two ledger records created by one stock_move event
  transferRef:     { type: String, index: true },
  // Transport details (for stock_move)
  transportName:   { type: String },
  driverName:      { type: String },
  vehicleName:     { type: String },
  distance:        { type: Number },
  cost:            { type: Number },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Measurement row (diary right-page entry)
const measurementRowSchema = new mongoose.Schema({
  lFt:    { type: Number, default: 0 },
  lIn:    { type: Number, default: 0 },
  dFt:    { type: Number, default: 0 },
  dIn:    { type: Number, default: 0 },
  l:      { type: Number, default: 0 },
  d:      { type: Number, default: 0 },
  nos:    { type: Number, default: 1 },
  total:  { type: Number, default: 0 },
  beamNo: { type: String, default: '' },
  type:   { type: String, enum: ['inside', 'open'], default: 'inside' },
  room:   { type: String, default: '' },
}, { _id: false });

// Measurement (diary-format: header + rows)
const measurementSchema = new mongoose.Schema({
  branch:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  location: { type: String, required: true },
  site:     { type: String, default: '' },
  floor:    { type: String, default: '' },
  villaNo:  { type: String, default: '' },
  remark:   { type: String, default: '' },
  date:     { type: Date, required: true, default: Date.now },
  rows:     { type: [measurementRowSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Attendance
const attendanceSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true },
  isPresent: { type: Boolean, default: false },
  otEnabled: { type: Boolean, default: false },
  otHours: { type: Number, default: 0 },
  hourRate: { type: Number, default: 0 },
  remarks: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Transport
const transportSchema = new mongoose.Schema({
  transportName: { type: String },
  vehicleNo: { type: String, required: true },
  driverName: { type: String, required: true },
  fromBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  toBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
  quantity: { type: Number },
  date: { type: Date, required: true, default: Date.now },
  distance: { type: Number },
  cost: { type: Number },
  remarks: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Expense
const expenseSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true, default: Date.now },
  description: { type: String },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receipt: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Payment tracking — set when paid via payment screen
  isPaid: { type: Boolean, default: false },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
}, { timestamps: true });

// Payment
const paymentSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  partyName: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, enum: ['cash', 'cheque', 'online', 'upi'], required: true },
  date: { type: Date, required: true, default: Date.now },
  referenceNo: { type: String },
  description: { type: String },
  type: { type: String, enum: ['received', 'paid'], required: true },
  category: { type: String, enum: ['labor', 'transport', 'expense', 'other'], default: 'other' },
  totalDue: { type: Number },
  // Employee salary/advance payment linkage
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  advanceAdjustment: { type: Number, default: 0 },
  // Labor / Transport payment period details
  periodFrom: { type: Date },
  periodTo: { type: Date },
  earnings: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  previousOutstanding: { type: Number, default: 0 },
  thisWeekOutstanding: { type: Number, default: 0 },
  // Transport-specific
  vehicleNo: { type: String },
  // Expense payment linkage
  expenseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Advance
const advanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true, default: Date.now },
  remarks: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = {
  Stock: mongoose.model('Stock', stockSchema),
  Measurement: mongoose.model('Measurement', measurementSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  Transport: mongoose.model('Transport', transportSchema),
  Expense: mongoose.model('Expense', expenseSchema),
  Payment: mongoose.model('Payment', paymentSchema),
  Advance: mongoose.model('Advance', advanceSchema),
};
