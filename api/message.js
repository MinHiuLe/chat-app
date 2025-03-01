const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const User = require('../models/User');
const authMiddleware = require('./authMiddleware');

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const { receiverUsername, content } = req.body;
  try {
    const receiver = await User.findOne({ username: receiverUsername });
    if (!receiver) {
      return res.status(404).json({ error: 'Receiver not found' });
    }
    const senderId = req.user.userId;
    const receiverId = receiver._id;
    const participants = [senderId, receiverId].sort();
    let session = await ChatSession.findOne({ participants });
    if (!session) {
      session = new ChatSession({ participants, messages: [] });
    }
    const newMessage = { senderId, content, timestamp: new Date() };
    session.messages.push(newMessage);
    await session.save();

    req.io.emit('newMessage', { senderId, receiverId, content, timestamp: newMessage.timestamp });

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  const { username } = req.query;
  try {
    const receiver = await User.findOne({ username });
    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }
    const senderId = req.user.userId;
    const receiverId = receiver._id;
    const participants = [senderId, receiverId].sort();
    const session = await ChatSession.findOne({ participants });
    if (!session) {
      return res.json([]);
    }
    res.json(session.messages);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;