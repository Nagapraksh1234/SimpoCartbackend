const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const staffUserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        passwordHash: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: ['staff', 'admin'],
            default: 'staff'
        }
    },
    {
        timestamps: true
    }
);

staffUserSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.passwordHash);
};

staffUserSchema.statics.hashPassword = function (plain) {
    return bcrypt.hash(plain, 10);
};

module.exports = mongoose.model('StaffUser', staffUserSchema);