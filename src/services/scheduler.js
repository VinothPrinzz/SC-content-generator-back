// services/scheduler.js
const schedule = require('node-schedule');
const Post = require('../database/postModel');
const getTwitterClient = require('../middleware/twitterAuth');
const axios = require('axios');

class PostScheduler {
  constructor() {
    this.jobs = new Map();
  }

  async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      return null;
    }
  }

  async executePost(postId) {
    try {
      const post = await Post.findById(postId);
      if (!post || post.posted) return;

      const client = await getTwitterClient();
      let mediaId = null;

      if (post.image) {
        const imageBuffer = await this.downloadImage(post.image);
        if (imageBuffer) {
          mediaId = await client.v1.uploadMedia(imageBuffer, { 
            mimeType: 'image/jpeg' 
          });
        }
      }

      const tweetContent = this.formatTweetContent(post);
      const tweetOptions = {
        text: tweetContent
      };

      if (mediaId) {
        tweetOptions.media = { media_ids: [mediaId] };
      }

      const tweet = await client.v2.tweet(tweetOptions);

      await Post.findByIdAndUpdate(postId, {
        posted: true,
        postError: null,
        tweetId: tweet.data.id
      });
    } catch (error) {
      const errorMessage = error.response?.status === 403 
        ? 'Authentication failed: Please reconnect your account'
        : 'Failed to post tweet';

      await Post.findByIdAndUpdate(postId, {
        postError: errorMessage,
        posted: false
      });
    }
  }

  formatTweetContent(post) {
    let content = post.content || '';
    
    if (post.hashtags) {
      const hashtagsStr = Array.isArray(post.hashtags) 
        ? post.hashtags.join(' ')
        : post.hashtags;
      
      const formattedHashtags = hashtagsStr
        .split(' ')
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' ');
      
      content = `${content}\n\n${formattedHashtags}`;
    }

    return content.slice(0, 280);
  }

  async schedulePost(post) {
    if (this.jobs.has(post._id.toString())) {
      this.jobs.get(post._id.toString()).cancel();
    }
    
    const job = schedule.scheduleJob(post.scheduledTime, async () => {
      await this.executePost(post._id);
    });

    this.jobs.set(post._id.toString(), job);
  }

  async initializeScheduledPosts() {
    try {
      const pendingPosts = await Post.find({
        schedule: true,
        posted: false,
        scheduledTime: { $gt: new Date() }
      });
      
      for (const post of pendingPosts) {
        await this.schedulePost(post);
      }
    } catch (error) {
      console.error('Failed to initialize scheduled posts');
    }
  }
}

const scheduler = new PostScheduler();
module.exports = scheduler;