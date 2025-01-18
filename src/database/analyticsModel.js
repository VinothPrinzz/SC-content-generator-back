const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/brainly")

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