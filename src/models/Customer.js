const mongoose = require('mongoose');
const {nextSequence} = require('./Counter');

const customerSchema = new mongoose.Schema({

    businessLoginId: {type: String, required: true, index: true},
    customerCode: { type: String, unique: true, index: true },
    custCategory: { type: String, default: 'COUNTER-SALE' },
    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    fullName: { type: String },
     primaryPhone: { type: String, required: true },
      email: String,
    gstNumber: String,
    panNumber: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    stateCode: String,
    pincode: String,
     createdBy: { type: String, default: 'WEBSITE' },
      externalCustomerId: { type: String, index: true },

},
{ timestamps: true }
);

// checkPrimaryPhoneNoExistence lookup).
customerSchema.index({ businessLoginId: 1, primaryPhone: 1 }, { unique: true });

customerSchema.pre('validate', async function () {
  if (!this.customerCode) {
    // Starts at 100000 to match the existing internal numbering range
    // (#101749-style codes) already shown in the UI.
    const seq = await nextSequence('customerCode')
    this.customerCode = String(100000 + seq)
  }
  if (!this.fullName) {
    this.fullName = [this.firstName, this.lastName].filter(Boolean).join(' ')
  }
})

module.exports = mongoose.model('Customer', customerSchema);