const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@test.gc8su9s.mongodb.net/brainly?retryWrites=true&w=majority&appName=test")

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
  scheduledTime: {
    type: Date,
    required: function() { return this.schedule === true; }
  },
  posted: {
    type: Boolean,
    default: false
  },
  postError: String,
  createdAt: { type: Date, default: Date.now }
});
  const Post = mongoose.model('Post', postSchema);

  module.exports = Post;