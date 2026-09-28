const express = require('express')
const Customer = require('../models/Customer')
const Order = require('../models/Order')
const { requireWebOrderCredentials } = require('../middleware/Weborderauth')

const router = express.Router()

const WEB_ORDER_BATCH_LIMIT = 100
const BUSINESS_LOGIN_ID = process.env.BUSINESS_LOGIN_ID || 'default'
const CREATED_BY = 'WEBSITE'

/**
 * POST /api/web-orders/sync
 *
 * Receives website orders (customer + order + items) as JSON and stores
 * them, find-or-creating the customer by phone number first.
 *
 * Ported from gafWebOrderSyncController.php. Accepted bodies:
 *   { "orders": [ { "customer": {...}, "order": {...} }, ... ] }
 *   { "customer": {...}, "order": {...} }                          <- single order
 *   [ { "customer": {...}, "order": {...} }, ... ]                 <- bare array
 *
 * client_id / access_key are checked by requireWebOrderCredentials before
 * this handler runs at all (header Client-Id/Access-Key, or body fallback).
 *
 * A bad order is skipped and reported; the rest of the batch still saves.
 */
router.post('/sync', requireWebOrderCredentials, async (req, res) => {
  const payload = req.body

  const entries = normalizeEntries(payload)

  if (entries.length === 0) {
    return res.status(400).json({
      result: false,
      response: 'INVALID_ORDER',
      responseText: 'No orders found - send { "orders": [ { "customer": {...}, "order": {...} } ] }',
    })
  }
  if (entries.length > WEB_ORDER_BATCH_LIMIT) {
    return res.status(400).json({
      result: false,
      response: 'BATCH_TOO_LARGE',
      responseText: `Maximum ${WEB_ORDER_BATCH_LIMIT} orders per request, got ${entries.length}`,
    })
  }

  const results = []
  const summary = { total: entries.length, saved: 0, duplicate: 0, failed: 0 }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const res_ = (entry && typeof entry === 'object' && !Array.isArray(entry))
      ? await processWebOrder(entry)
      : { status: 'INVALID_ORDER', message: 'entry is not an object' }

    const result = { index: i, ...res_ }

    if (result.status === 'SUCCESS') summary.saved++
    else if (result.status === 'DUPLICATE_ORDER') summary.duplicate++
    else summary.failed++

    results.push(result)
  }

  // result = true when nothing failed (duplicates are harmless re-sends)
  res.json({
    result: summary.failed === 0,
    response: { summary, orders: results },
    responseText: `${summary.saved} saved, ${summary.duplicate} duplicate, ${summary.failed} failed`,
  })
})

// =====================================================================
// normalize the body into a list of { customer, order } entries
// =====================================================================
function normalizeEntries(payload) {
  if (Array.isArray(payload)) {
    return payload
  }
  if (payload && Array.isArray(payload.orders)) {
    return payload.orders
  }
  if (payload && (payload.customer || payload.order)) {
    return [payload]
  }
  return []
}

// =====================================================================
// one order: validate -> customer -> header + items
// =====================================================================
async function processWebOrder(entry) {
  const customer = entry.customer || {}
  const order = entry.order || {}

  // Validate everything first, so a bad order never creates a customer
  const firstName = String(customer.first_name || '').trim()
  const lastName = String(customer.last_name || '').trim()
  const phone = String(customer.phone || '').replace(/\D/g, '').slice(-10) // 91XXXXXXXXXX -> XXXXXXXXXX
  const externalCustomerId = String(customer.external_customer_id || '').trim()
  const orderId = String(order.order_id || '').trim()

  const result = { order_id: orderId, external_customer_id: externalCustomerId }

  if (firstName === '' || phone.length !== 10) {
    return { ...result, status: 'INVALID_CUSTOMER', message: 'customer.first_name and a 10-digit customer.phone are required' }
  }
  if (orderId === '' || !Array.isArray(order.items) || order.items.length === 0) {
    return { ...result, status: 'INVALID_ORDER', message: 'order.order_id and order.items are required' }
  }
  const badLine = validateOrderItems(order.items)
  if (badLine !== '') {
    return { ...result, status: 'INVALID_ITEM', message: badLine }
  }

  // same order sent twice -> don't store it again
  const existingOrder = await Order.findOne({ businessLoginId: BUSINESS_LOGIN_ID, orderId })
  if (existingOrder) {
    return {
      ...result,
      status: 'DUPLICATE_ORDER',
      message: `Order ${orderId} already received`,
      customer_code: existingOrder.customerCode,
      header_id: existingOrder._id,
    }
  }

  // -----------------------------------------------------------------
  // Step 1: customer - find by phone first, insert only if not found
  // -----------------------------------------------------------------
  let customerCode
  let isNewCustomer = false

  const existingCustomer = await Customer.findOne({ businessLoginId: BUSINESS_LOGIN_ID, primaryPhone: phone })
  if (existingCustomer) {
    customerCode = existingCustomer.customerCode
  } else {
    try {
      const newCustomer = await Customer.create({
        businessLoginId: BUSINESS_LOGIN_ID,
        custCategory: 'COUNTER-SALE',
        firstName,
        lastName,
        primaryPhone: phone,
        email: customer.email || '',
        gstNumber: customer.gst_number || '',
        panNumber: customer.pan_number || '',
        address1: customer.address1 || '',
        address2: customer.address2 || '',
        city: customer.city || '',
        state: customer.state || '',
        stateCode: customer.state_code || '',
        pincode: customer.pincode || '',
        createdBy: CREATED_BY,
        externalCustomerId,
      })
      customerCode = newCustomer.customerCode
      isNewCustomer = true
    } catch (err) {
      return { ...result, status: 'CUSTOMER_INSERT_FAILED', message: err.message || 'Customer insert failed' }
    }
  }

  result.customer_code = customerCode
  result.is_new_customer = isNewCustomer

  // -----------------------------------------------------------------
  // Step 2: order + items, saved as one document (atomic by default —
  // this replaces the PHP's explicit $db->beginTransaction()/commit())
  // -----------------------------------------------------------------
  const items = order.items.map((item, i) => {
    const sku = String(item.part_number || item.sku || '').trim()
    return {
      lineNo: item.line_no ?? i + 1,
      sku: String(item.sku || '').trim(),
      partNumber: sku, // until a SKU mapping exists, website SKU = our part number
      partDescription: item.part_description || undefined,
      hsnCode: item.hsn_code || undefined,
      quantity: num(item.quantity),
      unitPrice: num(item.unit_price),
      discountPct: num(item.discount_pct),
      discountAmount: num(item.discount_amount),
      taxPct: num(item.tax_pct),
      taxAmount: num(item.tax_amount),
      lineAmount: num(item.line_amount),
    }
  })

  // Header totals come from the saved lines, not from the website's
  // header-level figures — same rule as the PHP's UPDATE ... JOIN:
  //   sub_total = gross (qty x price), discount/tax = sum of line values,
  //   total = sub_total - discount + tax + shipping
  const subTotal = round2(items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0))
  const discountAmount = round2(items.reduce((sum, it) => sum + it.discountAmount, 0))
  const taxAmount = round2(items.reduce((sum, it) => sum + it.taxAmount, 0))
  const shippingAmount = num(order.shipping_amount)
  const totalAmount = round2(subTotal - discountAmount + taxAmount + shippingAmount)

  const paymentStatusRaw = String(order.payment_status || '').toLowerCase()

  let orderDoc
  try {
    orderDoc = await Order.create({
      businessLoginId: BUSINESS_LOGIN_ID,
      orderId,
      orderDate: toDate(order.order_date),
      customerCode,
      externalCustomerId: externalCustomerId || undefined,
      shipAddress: order.ship_address || undefined,
      shipStateCode: order.ship_state_code || undefined,
      subTotal,
      discountAmount,
      taxAmount,
      cgstAmount: round2(taxAmount / 2),
      sgstAmount: round2(taxAmount / 2),
      shippingAmount,
      totalAmount,
      paymentMode: order.payment_mode || undefined,
      paymentStatus: paymentStatusRaw || undefined,
      paymentRef: order.payment_ref || undefined,
      paymentDate: order.payment_date ? toDate(order.payment_date) : undefined,
      status: 'new',
      items,
      rawPayload: entry,
      history: buildHistory(order, paymentStatusRaw, customerCode),
    })
  } catch (err) {
    // customer (if new) is already saved - its code is still in `result` for the website
    return {
      ...result,
      status: 'ORDER_INSERT_FAILED',
      message: `Order ${orderId} could not be saved`,
      error: err.message, // TODO: drop before go-live - exposes DB details to the caller
    }
  }

  return {
    ...result,
    status: 'SUCCESS',
    message: 'Order received',
    header_id: orderDoc._id,
    items_saved: items.length,
  }
}

function buildHistory(order, paymentStatus, customerCode) {
  const history = [{ label: 'Order placed on website', timestamp: toDate(order.order_date), done: true }]
  if (paymentStatus === 'paid') {
    history.push({ label: 'Payment received', timestamp: order.payment_date ? toDate(order.payment_date) : new Date(), done: true })
  }
  history.push({ label: `Received in SimpoCart · customer #${customerCode}`, timestamp: new Date(), done: true })
  history.push({ label: 'Waiting for counter sale', timestamp: null, done: false })
  return history
}

// =====================================================================
// helpers
// =====================================================================
function validateOrderItems(items) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const line = i + 1
    const sku = String(item.part_number || '').trim() !== '' ? String(item.part_number).trim() : String(item.sku || '').trim()
    if (sku === '') return `line ${line}: sku / part_number missing`
    if (!isNumeric(item.quantity) || Number(item.quantity) <= 0) return `line ${line} (${sku}): quantity must be greater than 0`
    if (!isNumeric(item.unit_price) || Number(item.unit_price) < 0) return `line ${line} (${sku}): invalid unit_price`
  }
  return ''
}

function isNumeric(value) {
  return value !== null && value !== undefined && value !== '' && !isNaN(Number(value))
}

function num(value) {
  return isNumeric(value) ? round2(Number(value)) : 0
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function toDate(value) {
  if (!value) return new Date()
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date() : d
}

module.exports = router