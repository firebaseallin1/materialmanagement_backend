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

// Measurement
const measurementSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  length: { type: Number },
  breadth: { type: Number },
  height: { type: Number },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'sqft' },
  date: { type: Date, required: true, default: Date.now },
  description: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Attendance
const attendanceSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
  vehicleNo: { type: String, required: true },
  driverName: { type: String, required: true },
  fromLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  toLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
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
}, { timestamps: true });

// Payment
const paymentSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  partyName: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, enum: ['cash', 'cheque', 'online', 'upi'], required: true },
  date: { type: Date, required: true, default: Date.now },
  referenceNo: { type: String },
  description: { type: String },
  type: { type: String, enum: ['received', 'paid'], required: true },
  // Employee salary payment linkage
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  advanceAdjustment: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Advance
const advanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
