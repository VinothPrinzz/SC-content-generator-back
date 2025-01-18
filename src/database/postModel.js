const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/brainly")

const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    platform: [String],
    industry: [String],
    tone: [String],
    content: String,
    hashtags: [String],
    caption: String,
    image: String,
    queue: Boolean,
    schedule: Boolean,
    scheduleTime: Date,
    
    createdAt: { type: Date, default: Date.now }
  });
  const Post = mongoose.model('Post', postSchema);

  module.exports = Post;