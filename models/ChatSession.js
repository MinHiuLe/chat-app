const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  ],
  messages: [
    {
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      content: { type: String },
      fileUrl: { type: String },
      fileName: { type: String },
      fileType: { type: String },
      isFile: { type: Boolean, default: false },
      seen: { type: Boolean, default: false }, // Thêm trường seen
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

chatSessionSchema.index({ participants: 1 }, { unique: true });

module.exports = mongoose.model('ChatSession', chatSessionSchema);