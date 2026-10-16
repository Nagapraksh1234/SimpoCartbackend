const { Schema, model } = require("mongoose");

const activitySchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    type: { type: String, required: true }, // lead_created, call_logged, stage_changed ...
    note: String,
    by: String,
  },
  { timestamps: true }
);

module.exports = model("Activity", activitySchema);