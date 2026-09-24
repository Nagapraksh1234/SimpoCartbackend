const mongoose = require('mongoose');

async function connectDB() {
    const uri = process.env.MONGO_URI;
    if(!uri) {
        throw new Error('MONGO_URI environment variable is not defined');
    }

    await mongoose.connect(uri)
    console.log('Connected to MongoDB');
}

module.exports = connectDB;
