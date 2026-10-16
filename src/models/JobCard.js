const { Schema, model } = require("mongoose");

const jobCardSchema = new Schema(
  {
    jobNo: { type: String, unique: true }, // JC-2207
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment" },
    items: { type: Array, default: [] }, // copied from the approved quotation
    technician: String,
    status: { type: String, enum: ["open", "in_progress", "ready", "delivered"], default: "open" },
  },
  { timestamps: true }
);

module.exports = model("JobCard", jobCardSchema);