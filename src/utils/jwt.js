const jwt = require('jsonwebtoken');

function signToken(staffUser) {
    return jwt.sign(
        { id: staffUser._id, role: staffUser.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET)
}

module.exports = { signToken, verifyToken };
