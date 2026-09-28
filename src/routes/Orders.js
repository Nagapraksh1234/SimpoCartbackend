const express = require('express')
const Order = require('../models/Order')
const Customer = require('../models/Customer')
const { requireStaffAuth } = require('../middleware/staffAuth')

const router = express.Router()

// Maps our stored Order + its Customer into the shape OrdersList.tsx /
// OrderDetail.tsx already expect (see frontend src/types/orders.ts).
function toFrontendOrder(order, customer) {
  const taxTotal = order.taxAmount || 0
  return {
    id: order._id,
    orderNumber: order.orderId,
    placedAt: order.orderDate,
    status: order.status,
    paymentStatus: order.paymentStatus || 'pending',
    paymentMode: order.paymentMode || 'ONLINE',
    customer: {
      name: customer ? (customer.fullName || customer.firstName) : 'Unknown customer',
      phone: customer ? customer.primaryPhone : '',
      email: customer?.email || undefined,
      gstin: customer?.gstNumber || undefined,
      internalCode: order.customerCode,
      externalCustomerCode: order.externalCustomerId || '',
    },
    shipping: {
      address: order.shipAddress || '',
      stateCode: order.shipStateCode || '',
      stateNote: order.shipStateCode ? 'Same state (CGST + SGST)' : '',
      mode: order.paymentMode || 'ONLINE',
      gatewayRef: order.paymentRef || undefined,
      paidOn: order.paymentDate || undefined,
    },
    items: order.items.map((item) => ({
      sku: item.sku || item.partNumber,
      name: item.partDescription || item.partNumber,
      hsn: item.hsnCode || '',
      qty: item.quantity,
      rate: item.unitPrice,
      discountPercent: item.discountPct || undefined,
      discountAmount: item.discountAmount || 0,
      taxableAmount: Math.round((item.quantity * item.unitPrice - (item.discountAmount || 0)) * 100) / 100,
      taxPercent: item.taxPct || 0,
      taxAmount: item.taxAmount || 0,
    })),
    subtotal: order.subTotal,
    discount: order.discountAmount,
    cgst: order.cgstAmount,
    sgst: order.sgstAmount,
    shippingAmount: order.shippingAmount,
    total: order.totalAmount,
    history: (order.history || []).map((h) => ({ label: h.label, timestamp: h.timestamp, done: h.done })),
    websitePayload: order.rawPayload,
    createdAt: order.createdAt,
  }
}

async function attachCustomers(orders) {
  const codes = [...new Set(orders.map((o) => o.customerCode))]
  const customers = await Customer.find({ customerCode: { $in: codes } })
  const byCode = new Map(customers.map((c) => [c.customerCode, c]))
  return orders.map((o) => toFrontendOrder(o, byCode.get(o.customerCode)))
}

// List orders for review — filters: status, from, to, q (search), paymentMode
router.get('/', requireStaffAuth, async (req, res) => {
  const { status, from, to, q, paymentMode } = req.query
  const filter = {}

  if (status) filter.status = status
  if (paymentMode) filter.paymentMode = paymentMode
  if (from || to) {
    filter.orderDate = {}
    if (from) filter.orderDate.$gte = new Date(from)
    if (to) filter.orderDate.$lte = new Date(new Date(to).getTime() + 86400000 - 1) // inclusive end of day
  }
  if (q) {
    filter.$or = [
      { orderId: { $regex: q, $options: 'i' } },
      { externalCustomerId: { $regex: q, $options: 'i' } },
      { customerCode: { $regex: q, $options: 'i' } },
    ]
  }

  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200)
  res.json(await attachCustomers(orders))
})

router.get('/:id', requireStaffAuth, async (req, res) => {
  const order = await Order.findById(req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found' })
  const customer = await Customer.findOne({ customerCode: order.customerCode })
  res.json(toFrontendOrder(order, customer))
})

// Convert a reviewed order into a counter sale
router.patch('/:id/convert', requireStaffAuth, async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: 'converted',
      convertedAt: new Date(),
      convertedBy: req.staffUser._id,
      $push: { history: { label: 'Converted to counter sale', timestamp: new Date(), done: true } },
    },
    { new: true }
  )
  if (!order) return res.status(404).json({ error: 'Order not found' })
  const customer = await Customer.findOne({ customerCode: order.customerCode })
  res.json(toFrontendOrder(order, customer))
})

router.patch('/:id/cancel', requireStaffAuth, async (req, res) => {
  const { reason } = req.body
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: 'cancelled',
      cancelReason: reason,
      $push: { history: { label: `Order cancelled${reason ? `: ${reason}` : ''}`, timestamp: new Date(), done: true } },
    },
    { new: true }
  )
  if (!order) return res.status(404).json({ error: 'Order not found' })
  const customer = await Customer.findOne({ customerCode: order.customerCode })
  res.json(toFrontendOrder(order, customer))
})

module.exports = router