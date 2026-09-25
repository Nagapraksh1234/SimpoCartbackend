const express = require('express');
const StaffUser = require('../models/StaffUser');
const { signToken } = require('../utils/jwt');
const { requireStaffAuth } = require('../middleware/staffAuth');

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'name, email and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters',
      });
    }

    const existing = await StaffUser.findOne({
      email: email.toLowerCase(),
    });

    if (existing) {
      return res.status(409).json({
        error: 'An account with this email already exists',
      });
    }

    const passwordHash = await StaffUser.hashPassword(password);

    const user = await StaffUser.create({
      name,
      email,
      passwordHash,
    });

    const token = signToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('SIGNUP ERROR:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login request:', {
      email,
      passwordProvided: !!password,
    });

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const user = await StaffUser.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      console.log('User not found:', email);

      return res.status(401).json({
        error: 'Incorrect email or password',
      });
    }

    console.log('User found:', user.email);

    const valid = await user.comparePassword(password);

    console.log('Password valid:', valid);

    if (!valid) {
      return res.status(401).json({
        error: 'Incorrect email or password',
      });
    }

    const token = signToken(user);

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

router.get('/me', requireStaffAuth, (req, res) => {
  const { _id, name, email, role } = req.staffUser;

  res.json({
    id: _id,
    name,
    email,
    role,
  });
});

module.exports = router;