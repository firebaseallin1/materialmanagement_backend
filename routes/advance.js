const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/advanceController');
const { protect, adminOnly } = require('../middleware/auth');
router.get('/balance', protect, ctrl.getBalance);
router.get('/', protect, ctrl.getAll);
router.get('/:id', protect, ctrl.getOne);
// Users can only view their advances — recording and changing is admin-only
router.post('/', protect, adminOnly, ctrl.create);
router.put('/:id', protect, adminOnly, ctrl.update);
router.delete('/:id', protect, adminOnly, ctrl.remove);
module.exports = router;
