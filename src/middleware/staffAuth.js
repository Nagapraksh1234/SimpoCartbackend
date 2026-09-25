const {verifyToken} = require('../utils/jwt');
const StaffUser = require('../models/StaffUser')

// Protects staff-only routes (order review, conversion, customer lookup).

async function requireStaffAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' })
    }

    try{

        const decoded = verifyToken(token);
        const user = await StaffUser.findById(decoded.id)
        if (!user) return res.status(401).json({ error: 'User no longer exists' })
        req.staffUser = user
        next()

    }catch(err){
            return res.status(401).json({ error: 'Invalid or expired token' })
    }
}

function requireAdmin(req, res, next) {
  if (!req.staffUser || req.staffUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

module.exports = { requireStaffAuth, requireAdmin }
