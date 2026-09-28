const express = require('express')
const Customer = require('../models/Customer')
const { requireStaffAuth } = require('../middleware/staffAuth')

const router = express.Router()

router.get('/', requireStaffAuth, async (req, res) => {
  const { q } = req.query
  const filter = q
    ? {
        $or: [
          { fullName: { $regex: q, $options: 'i' } },
          { firstName: { $regex: q, $options: 'i' } },
          { primaryPhone: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { customerCode: { $regex: q, $options: 'i' } },
          { externalCustomerId: { $regex: q, $options: 'i' } },
        ],
      }
    : {}

  const customers = await Customer.find(filter).sort({ createdAt: -1 }).limit(100)
  res.json(customers)
})

router.get('/:id', requireStaffAuth, async (req, res) => {
  const customer = await Customer.findById(req.params.id)
  if (!customer) return res.status(404).json({ error: 'Customer not found' })
  res.json(customer)
})

module.exports = router