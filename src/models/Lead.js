const { Schema, model } = require("mongoose");

const STAGES = ["followup", "quotation", "approval", "appointment", "jobcard", "closed", "lost"];
const BOARD_STAGES = ["followup", "quotation", "approval", "appointment", "jobcard"];

const leadSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    stage: { type: String, enum: STAGES, default: "followup" },
    callStatus: {
      type: String,
      enum: ["pending", "callback", "no_answer", "connected"],
      default: "pending",
    },
    requirement: String,
    nextCallAt: Date,
    assignedAgent: String, // agent name for now; switch to a User ref when you add auth
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment" },
    jobCardId: { type: Schema.Types.ObjectId, ref: "JobCard" },
  },
  { timestamps: true }
);

leadSchema.index({ stage: 1, assignedAgent: 1 });

const Lead = model("Lead", leadSchema);

module.exports = Lead;
module.exports.STAGES = STAGES;
module.exports.BOARD_STAGES = BOARD_STAGES;