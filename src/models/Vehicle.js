const { Schema, model } = require("mongoose");

const vehicleSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    regNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    make: String,
    model: String,
  },
  { timestamps: true }
);

module.exports = model("Vehicle", vehicleSchema);