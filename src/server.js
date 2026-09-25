const dns = require('dns');

// Use public DNS for MongoDB Atlas SRV lookup
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/authRouter');

const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();

console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);


const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);

// Connect to MongoDB
connectDB().catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});