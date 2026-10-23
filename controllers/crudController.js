// Generic CRUD factory for master models
const crudController = (Model, populateFields = '') => ({
  getAll: async (req, res) => {
    try {
      const { search, page = 1, limit = 50, isActive } = req.query;
      const query = {};
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (search) query.name = { $regex: search, $options: 'i' };
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        Model.find(query).populate(populateFields).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        Model.countDocuments(query),
      ]);
      res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getOne: async (req, res) => {
    try {
      const doc = await Model.findById(req.params.id).populate(populateFields);
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true, data: doc });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  create: async (req, res) => {
    try {
      const doc = await Model.create({ ...req.body, createdBy: req.user?.id });
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  update: async (req, res) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate(populateFields);
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true, data: doc });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  remove: async (req, res) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
});

module.exports = crudController;
