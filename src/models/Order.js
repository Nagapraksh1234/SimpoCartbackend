const mongoose = require('mongoose')


const orderItemSchema = new mongoose.Schema(
  {
    lineNo: { type: Number, required: true },
    sku: { type: String, required: true },
    // Until a real SKU mapping exists, website SKU = our part number
    // (matches the PHP's ":part_number" fallback to $sku).
    partNumber: { type: String, required: true },
    partDescription: String,
    hsnCode: String,
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    discountPct: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxPct: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    lineAmount: { type: Number, default: 0 },
  },
  { _id: false }
)

const orderSchema = new mongoose.Schema(
  {
    businessLoginId: { type: String, required: true, index: true },

    // The website's own order reference (e.g. "WO-2026-0010") — used
    // directly as our order number, and as the duplicate-send check.
    orderId: { type: String, required: true },
    orderDate: { type: Date, default: Date.now },

    customerCode: { type: String, required: true, index: true },
    externalCustomerId: String,

    shipAddress: String,
    shipStateCode: String,

    subTotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    // Split evenly for same-state display (CGST + SGST) — the PHP only
    // tracks one combined tax_amount; this is a display-only convenience
    // for the order-detail screen, not sourced from the PHP.
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    shippingAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    paymentMode: String, // ONLINE | CARD | UPI | COD | BANK_TRANSFER
    paymentStatus: String, // paid | pending
    paymentRef: String,
    paymentDate: Date,

    status: {
      type: String,
      enum: ['new', 'converted', 'error', 'cancelled'],
      default: 'new',
      index: true,
    },
    cancelReason: String,
    convertedAt: Date,
    convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },

    items: [orderItemSchema],

    history: [
      {
        label: String,
        timestamp: Date,
        done: { type: Boolean, default: true },
      },
    ],

    // The order entry exactly as received (customer + order), for the
    // "Website payload (as received)" panel — same intent as the PHP's
    // raw_payload column.
    rawPayload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
)

// Same order sent twice shouldn't be stored twice, scoped per business —
// mirrors the PHP's duplicate lookup on (business_login_id, order_id).
orderSchema.index({ businessLoginId: 1, orderId: 1 }, { unique: true })

module.exports = mongoose.model('Order', orderSchema)