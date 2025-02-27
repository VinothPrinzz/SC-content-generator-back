const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@test.gc8su9s.mongodb.net/brainly?retryWrites=true&w=majority&appName=test")

const socialAccountSchema = new mongoose.Schema({
    userId: {  
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    platform: {
      type: String,
      required: true,
      enum: ['twitter', 'linkedin', 'instagram']
    },
    accountId: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    accessToken: String,
    tokenSecret: String,
    profile: Object,
    isActive: {
      type: Boolean,
      default: true
    }
  }, {
    timestamps: true
  });


// user can't connect same platform multiple times
// socialAccountSchema.index({ userId: 1, platform: 1 }, { unique: true });
// socialAccountSchema.index({ accountId: 1, platform: 1 }, { unique: true });

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

module.exports = SocialAccount;