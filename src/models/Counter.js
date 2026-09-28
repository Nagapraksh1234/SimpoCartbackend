const mongoose = require('mongoose')

// Used to generate sequential, human-readable codes (CUST-000123, ORD-000456)
// without race conditions — findOneAndUpdate with $inc is atomic in MongoDB.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'customerCode', 'orderNumber'
  seq: { type: Number, default: 0 },
})

const Counter = mongoose.model('Counter', counterSchema)

async function nextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  )
  return counter.seq
}

module.exports = { nextSequence }