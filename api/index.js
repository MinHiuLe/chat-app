const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authRoutes = require('./auth');
const messageRoutes = require('./message');
const User = require('../models/User');
const authMiddleware = require('./authMiddleware');

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());

mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users.filter(user => user._id.toString() !== req.user.userId));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Export cho Vercel Serverless Functions
module.exports = app;