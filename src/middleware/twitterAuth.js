// middleware/twitterAuth.js
const { TwitterApi } = require('twitter-api-v2');
const SocialAccount = require('../database/socialAccoutModel');

const getTwitterClient = async () => {
  try {
    const socialAccount = await SocialAccount.findOne({
      platform: 'twitter',
      isActive: true
    }).sort({ createdAt: -1 });

    if (!socialAccount || !socialAccount.accessToken || !socialAccount.tokenSecret) {
      throw new Error('No active Twitter account found');
    }

    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: socialAccount.accessToken,
      accessSecret: socialAccount.tokenSecret,
    });

    await client.currentUser();
    return client;
  } catch (error) {
    throw new Error('Twitter authentication failed');
  }
};

module.exports = getTwitterClient;