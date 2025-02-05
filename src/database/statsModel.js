const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@test.gc8su9s.mongodb.net/brainly?retryWrites=true&w=majority&appName=test")

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