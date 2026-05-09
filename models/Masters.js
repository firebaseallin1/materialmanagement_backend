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

module.exports = {
  Location: mongoose.model('Location', locationSchema),
  Branch: mongoose.model('Branch', branchSchema),
  Category: mongoose.model('Category', categorySchema),
  ExpenseCategory: mongoose.model('ExpenseCategory', expenseCategorySchema),
  Material: mongoose.model('Material', materialSchema),
};
