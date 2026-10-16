const { Schema, model } = require("mongoose");

const itemSchema = new Schema(
  {
    description: { type: String, required: true },
    kind: { type: String, enum: ["part", "labour"], default: "part" },
    qty: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const quotationSchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    quoteNo: { type: String, unique: true }, // QT-1042
    items: [itemSchema],
    total: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "sent", "approved", "rejected"], default: "draft" },
    rejectReason: String,
    sentAt: Date,
    respondedAt: Date,
  },
  { timestamps: true }
);

module.exports = model("Quotation", quotationSchema);