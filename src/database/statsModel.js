const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/brainly")

const statsSchema = new mongoose.Schema({
     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    followersIncrease: Number,
    engagementRate: Number,
    numPosts: Number,
    comments: Number,
    impressions: Number,
    profileViews: Number,
    likes: Number,
    shares: Number,
    month: String
  });
  const Stats = mongoose.model('Stats', statsSchema);

  module.exports = Stats;