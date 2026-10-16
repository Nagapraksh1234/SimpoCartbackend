const { Schema, model } = require("mongoose");

const appointmentSchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },
    slotStart: { type: Date, required: true, index: true },
    bay: { type: String, required: true },
    status: { type: String, enum: ["booked", "arrived", "no_show", "cancelled"], default: "booked" },
  },
  { timestamps: true }
);

module.exports = model("Appointment", appointmentSchema);