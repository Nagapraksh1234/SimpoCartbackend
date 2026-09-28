const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

    // Log which env var was found (masking the password) so we can see
    // immediately if the URI is missing or pointing at the wrong variable.
    if (!uri) {
        console.error('No MONGO_URI or MONGODB_URI found in environment variables.');
        throw new Error('Mongo connection string is not set');
    }
    console.log('Connecting with URI:', uri.replace(/:([^:@]+)@/, ':****@'));

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 8000, // fail fast instead of hanging silently
        });
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        throw error;
    }
};

module.exports = connectDB;