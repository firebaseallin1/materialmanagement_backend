const mongoose = require('mongoose');

// Location
const locationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  address: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Branch
const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  contactPerson: { type: String },
  phone: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Category
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Expense Category
const expenseCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Material
const materialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, unique: true, sparse: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  unit: { type: String, required: true, default: 'pcs' },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// User Category
const userCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String },
  permissions: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Employee
const employeeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  empCode:     { type: String, unique: true, sparse: true, trim: true },
  designation: { type: String, required: true, trim: true },
  department:  { type: String, trim: true },
  branch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  phone:       { type: String, trim: true },
  email:       { type: String, trim: true, lowercase: true },
  joiningDate: { type: Date },
  address:     { type: String, trim: true },
  photo:       { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = {
  Location: mongoose.model('Location', locationSchema),
  Branch: mongoose.model('Branch', branchSchema),
  Category: mongoose.model('Category', categorySchema),
  ExpenseCategory: mongoose.model('ExpenseCategory', expenseCategorySchema),
  UserCategory: mongoose.model('UserCategory', userCategorySchema),
  Material: mongoose.model('Material', materialSchema),
  Employee: mongoose.model('Employee', employeeSchema),
};
