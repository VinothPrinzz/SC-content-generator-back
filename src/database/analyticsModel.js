const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@test.gc8su9s.mongodb.net/brainly?retryWrites=true&w=majority&appName=test")

const analyticsSchema = new mongoose.Schema({
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    likes: Number,
    shares: Number,
    comments: Number,
    impressions: Number,
    createdAt: { type: Date, default: Date.now }
  });
  const Analytics = mongoose.model('Analytics', analyticsSchema);

  module.exports = Analytics;