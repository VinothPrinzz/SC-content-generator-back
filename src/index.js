const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const UserModel = require("./database/userModel");
const Post = require("./database/postModel");
const Analytics = require("./database/analyticsModel");
const Stats = require("./database/statsModel");
const SocialAccount = require("./database/socialAccoutModel");
const authenticateToken = require("./middleware/userAuthenticate");
const scheduler = require('./services/scheduler');
const getTwitterClient = require("./middleware/twitterAuth")
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const { TwitterApi } = require('twitter-api-v2');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF)$/)) {
    req.fileValidationError = 'Only image files are allowed!';
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

// Initialize multer with configuration
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  }
});

// Create uploads directory if it doesn't exist

const dir = './uploads';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}



const genAI = new GoogleGenerativeAI("AIzaSyBBivvwU4lxDYe3mam8BqRoPQLoKLL53tM");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


const app = express();

//Middlewares
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
}));

// Initialize passport and session
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.use(new TwitterStrategy({
  consumerKey: process.env.TWITTER_API_KEY,
  consumerSecret: process.env.TWITTER_API_SECRET,
  callbackURL: "http://localhost:3000/api/v1/auth/twitter/callback",
  passReqToCallback: true
},
async function(req, token, tokenSecret, profile, done) {
  const socialAccount = await SocialAccount.findOneAndUpdate(
    { 
      userId: req.session.userId,
      platform: 'twitter',
      accountId: profile.id
    },
    {
      username: profile.username,
      accessToken: token,
      tokenSecret: tokenSecret,
      profile: profile._json,
      isActive: true
    },
    { upsert: true, new: true }
  );

  return done(null, { socialAccount });
}
));

// serialize/deserialize
passport.serializeUser((user, done) => {
  done(null, {
    accountId: user.socialAccount?.accountId,
    platform: user.socialAccount?.platform
  });
});

passport.deserializeUser(async (serializedUser, done) => {
  try {
    const socialAccount = await SocialAccount.findOne({
      accountId: serializedUser.accountId,
      platform: serializedUser.platform
    });
    done(null, { socialAccount });
  } catch (err) {
    done(err);
  }
});

const generate = async(prompt) => {
  try{
      const result = await model.generateContent(prompt);
      console.log(result.response.text());
      return result.response.text();
  }catch(err){
      console.log(err);
  }
}




const unsplashClient = axios.create({
    baseURL: 'https://api.unsplash.com',
    headers: {
        Authorization: `Client-ID 7ZBQNRpy8rauuE7Cld7GptJHnbe2kBYXI52yat4cY6s`
    }
});

// Function to fetch images based on a specific prompt
async function getImageByPrompt(prompt) {
  try {
      const response = await unsplashClient.get('/search/photos', {
          params: {
              query: prompt,
              per_page: 1,
              orientation: 'landscape',
          }
      });

      // Return the first image from the search results
      if (response.data.results.length > 0) {
          return response.data.results[0].urls.regular;
      }
      
      // Return a default image URL if no results
      return "/api/placeholder/400/320";

  } catch (error) {
      console.error('Error fetching image:', error);
      // Return a default image URL on error
      return "/api/placeholder/400/320";
  }
}



app.get("/", (req, res) => {
    res.json({message: "Contected"})
})

app.post("/api/v1/signup", async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const userEmail = req.body.userEmail;

    if (!username || !password || !userEmail) {
        return res.status(400).json({
            message: "Username and password are required",
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {

        await UserModel.create({ username, userEmail, password: hashedPassword });

        res.json({
            message: "User signed up"
        })
    } catch(e) {
        res.status(411).json({
            message: "User already exist"
        })
    }
})

app.post("/api/v1/signin", async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;


    const existingUser = await UserModel.findOne({ username });
    if (!existingUser) {
        return res.status(403).json({ message: "Incorrect credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
        return res.status(403).json({ message: "Incorrect credentials" });
    }

    const token = jwt.sign({ id: existingUser._id }, "JWT_PASSWORD", { expiresIn: "1h" });

    res.json({ token, message: "Successfully Signed In" });
});



// Generate Post route
app.post('/api/v1/posts/generate/:userId', async (req, res) => {
  const { platform, industry, tone, contentTopic, keywords } = req.body;
  const { userId } = req.params;
  
  try {
      // Ensure keywords is an array
      const validKeywords = Array.isArray(keywords) ? keywords : [];

      // Generate content
      const content = await generate(`Create a detailed professional LinkedIn post about ${contentTopic} in ${tone} tone for ${industry} field using these keywords: ${validKeywords.join(', ')}. Write multiple paragraphs with business insights. Content only.`);
      const hashtags = await generate(`Generate 8-10 engaging hashtags mixing popular and niche terms for: ${content}. Hashtags only.`);
      const imagePrompt = await generate(`Describe a single visually striking photo for: ${contentTopic}. Focus on aesthetic appeal and storytelling. One clear description only.`);
      
      // Get image URL
      let imageUrl = "/api/placeholder/400/320"; // Default fallback
      if (!platform.includes('LinkedIn')) {
          const fetchedImageUrl = await getImageByPrompt(imagePrompt);
          if (fetchedImageUrl) {
              imageUrl = fetchedImageUrl;
          }
      }

      const caption = await generate(`Write a one-line professional headline for: ${content}. Headline only.`);
      const bestTimeToPost = await generate(`State the optimal or any general posting time and date for ${industry} content on ${platform}. Time in IST only.`);

      // Save to database
      const newPost = new Post({
          userId,
          platform,
          industry,
          tone,
          content,
          hashtags,
          image: imageUrl, // Use the properly fetched or fallback image URL
          caption,
          queue: false,
          schedule: false,
          createdAt: new Date()
      });
      await newPost.save();

      res.status(201).json({ 
          message: 'Post generated successfully', 
          post: newPost, 
          suggestedPostingTime: bestTimeToPost 
      });
  } catch (error) {
      console.error('Error generating post:', error);
      res.status(500).json({ error: 'Failed to generate post. Please try again.' });
  }
});

// Create new post route
app.post('/api/v1/posts/create', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { platform, content, hashtags, caption, scheduledTime } = req.body;
    const userId = req.user.id;

    // Create a new post object
    const newPost = new Post({
      userId,
      platform: [platform], // Keep as array to match existing structure
      content,
      hashtags,
      caption,
      scheduledTime,
      queue: false,        // Set queue to false since it's scheduled
      schedule: true       // Set schedule to true
    });

    // If image was uploaded, add the path
    if (req.file) {
      newPost.image = `/uploads/${req.file.filename}`;
    }

    await newPost.save();
    res.status(201).json(newPost);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: error.message });
  }
});


// Add this to serve uploaded files
app.use('/uploads', express.static('uploads'));


app.put('/api/v1/posts/queue/:postId', async (req, res) => {
const { postId } = req.params; // Expect `postId` in the request body

try {
    // Find and update the post
    const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { queue: true }, // Set queue to true
    { new: true } // Return the updated document
    );

    if (!updatedPost) {
    return res.status(404).json({ message: 'Post not found' });
    }

    res.status(200).json({
    message: 'Post added to queue successfully',
    post: updatedPost
    });
} catch (error) {
    res.status(500).json({ error: error.message });
}
});
  


// Schedule Post
app.put('/api/v1/posts/schedule/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { scheduledTime } = req.body;

    // Validate scheduled time
    const scheduleDate = new Date(scheduledTime);
    if (isNaN(scheduleDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (scheduleDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const post = await Post.findByIdAndUpdate(
      postId,
      {
        schedule: true,
        scheduledTime: scheduleDate,
        queue: false
      },
      { new: true }
    );

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Schedule the post
    await scheduler.schedulePost(post);

    res.status(200).json(post);
  } catch (error) {
    console.error('Error scheduling post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add endpoint to get scheduled post status
app.get('/api/v1/posts/schedule/status/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.json({
      scheduled: post.schedule,
      scheduledTime: post.scheduledTime,
      posted: post.posted,
      error: post.postError
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backend
app.get('/api/v1/user', authenticateToken, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      username: user.username,
      email: user.userEmail
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch All Posts
app.get('/api/v1/posts', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.id;
      const posts = await Post.find({ userId: userId });
      res.status(200).json(posts);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Fetch Scheduled Posts
app.get('/api/v1/posts/schedule', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.id;
      const posts = await Post.find({ 
          userId: userId,
          schedule: true 
      });
      res.status(200).json(posts);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Fetch Queued Posts
app.get('/api/v1/posts/queue', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.id; // Get userId from authenticated token
      const posts = await Post.find({ 
          userId: userId,
          queue: true 
      });
      res.status(200).json(posts);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// Get single post
app.get('/api/v1/posts/queue/:postId', authenticateToken, async (req, res) => {
  try {
      const { postId } = req.params;
      const userId = req.user.id;
      const post = await Post.findOne({
          _id: postId,
          userId: userId
      });
      if (!post) {
          return res.status(404).json({ message: 'Post not found' });
      }
      res.status(200).json(post);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Fetch Analytics
app.get('/api/v1/posts/analytics', authenticateToken, async (req, res) => {
  try {
    const analytics = await Analytics.aggregate([
      {
        $group: {
          _id: null,
          totalEngagement: { $sum: { $add: ['$likes', '$shares', '$comments'] } },
          totalPosts: { $sum: 1 },
          avgEngagement: { 
            $avg: { $add: ['$likes', '$shares', '$comments'] } 
          }
        }
      }
    ]);

    res.json(analytics[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Fetch Stats
app.get('/api/v1/stats', async (req, res) => {
    try {
      const stats = await Stats.find();
      res.status(200).json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// Get public post details
app.get('/api/v1/posts/share/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    // Return only public-safe information
    const publicPost = {
      content: post.content,
      caption: post.caption,
      platform: post.platform,
      scheduledTime: post.scheduledTime
    };
    res.status(200).json(publicPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete Post
app.delete('/api/v1/:post_id', authenticateToken, async (req, res) => {
  try {
      const { post_id } = req.params;
      const userId = req.user.id;
      
      const post = await Post.findOneAndDelete({
          _id: post_id,
          userId: userId
      });
      
      if (!post) {
          return res.status(404).json({ message: 'Post not found or unauthorized' });
      }
      
      res.status(200).json({ message: 'Post deleted successfully' });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Update Post
app.put('/api/v1/:post_id', authenticateToken, async (req, res) => {
  try {
      const { post_id } = req.params;
      const userId = req.user.id;
      
      const updatedPost = await Post.findOneAndUpdate(
          {
              _id: post_id,
              userId: userId
          },
          req.body,
          { new: true }
      );
      
      if (!updatedPost) {
          return res.status(404).json({ message: 'Post not found or unauthorized' });
      }
      
      res.status(200).json(updatedPost);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// middleware to hadle token from query params
const handleTokenFromQuery = (req, res, next) => {
  const token = req.query.token;
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
  }
  next();
};

// Twitter auth routes
app.get('/api/v1/auth/twitter', (req, res, next) => {
  const token = req.query.token;
  const decoded = jwt.verify(token, "JWT_PASSWORD");
  req.session.userId = decoded.id;
  passport.authenticate('twitter')(req, res, next);
});

app.get('/api/v1/auth/twitter/callback', 
  passport.authenticate('twitter', { 
    failureRedirect: 'http://localhost:5173/social-accounts?error=failed'
  }),
  (req, res) => {
    res.redirect('http://localhost:5173/social-accounts?success=true');
  }
);

// error handler for authentication failures
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.name === 'SessionError') {
    return res.redirect('http://localhost:5173/social-accounts?error=' + encodeURIComponent(err.message));
  }
  next(err);
});

// verifying twitter connection
app.get('/api/v1/twitter/verify', async (req, res) => {
  try {
    const client = await getTwitterClient();
    const me = await client.v2.me();
    res.json({
      status: 'success',
      user: me.data
    });
  } catch (error) {
    console.error('Twitter verification error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: error.response?.data || error
    });
  }
});

// fetch twitter metrics
app.get('/api/v1/twitter/metrics', authenticateToken, async (req, res) => {
  try {
    // Get the Twitter client
    const client = await getTwitterClient();
    
    // Get the user's profile
    const userResponse = await client.v2.me({
      'user.fields': ['public_metrics', 'username']
    });

    // Get tweets with pagination
    const tweetsResponse = await client.v2.userTimeline(userResponse.data.id, {
      'tweet.fields': ['public_metrics', 'created_at'],
      'max_results': 100
    });

    // Get tweets array from the response
    const tweets = tweetsResponse._realData.data || [];

    // Calculate engagement stats safely
    const tweetStats = tweets.reduce((acc, tweet) => {
      const metrics = tweet.public_metrics || {};
      return {
        totalLikes: (acc.totalLikes || 0) + (Number(metrics.like_count) || 0),
        totalRetweets: (acc.totalRetweets || 0) + (Number(metrics.retweet_count) || 0),
        totalReplies: (acc.totalReplies || 0) + (Number(metrics.reply_count) || 0)
      };
    }, { totalLikes: 0, totalRetweets: 0, totalReplies: 0 });

    // Format the data for the frontend
    const formattedTweets = tweets.map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at,
      public_metrics: {
        like_count: Number(tweet.public_metrics?.like_count || 0),
        retweet_count: Number(tweet.public_metrics?.retweet_count || 0),
        reply_count: Number(tweet.public_metrics?.reply_count || 0)
      }
    }));

    // Format the response
    const response = {
      user: {
        ...userResponse.data,
        public_metrics: {
          followers_count: Number(userResponse.data.public_metrics?.followers_count || 0),
          following_count: Number(userResponse.data.public_metrics?.following_count || 0),
          tweet_count: Number(userResponse.data.public_metrics?.tweet_count || 0),
          listed_count: Number(userResponse.data.public_metrics?.listed_count || 0)
        }
      },
      tweets: formattedTweets,
      stats: {
        ...tweetStats,
        totalEngagement: tweetStats.totalLikes + tweetStats.totalRetweets + tweetStats.totalReplies,
        averageEngagement: tweets.length > 0 
          ? (tweetStats.totalLikes + tweetStats.totalRetweets + tweetStats.totalReplies) / tweets.length 
          : 0
      }
    };

    console.log('Twitter metrics response:', {
      userMetrics: response.user.public_metrics,
      statsCount: response.tweets.length,
      engagementStats: response.stats
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching Twitter metrics:', error);
    
    // Provide more detailed error information
    const errorMessage = error.data?.detail || error.message || 'Unknown error occurred';
    res.status(500).json({ 
      error: errorMessage,
      details: error.data || {} 
    });
  }
});

// fetch social accounts
app.get('/api/v1/social-accounts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;  // Get userId from authenticated token

    const accounts = await SocialAccount.find({
      userId: userId,  // Filter by userId
      isActive: true
    }).sort({ createdAt: -1 });

    const transformedAccounts = accounts.map(account => ({
      id: account._id,
      platform: account.platform,
      username: account.username,
      dateAdded: account.createdAt,
      avatarUrl: account.profile?.profile_image_url || `/api/placeholder/48/48`
    }));

    res.json(transformedAccounts);
  } catch (error) {
    console.error('Error fetching social accounts:', error);
    res.status(500).json({ error: 'Failed to fetch social accounts' });
  }
});

// check social account connection
app.get('/api/v1/social-accounts/check/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    console.log('Checking platform:', platform); // Debug log

    const socialAccount = await SocialAccount.findOne({
      platform: platform.toLowerCase(),
      isActive: true
    });

    console.log('Found social account:', socialAccount); // Debug log

    if (socialAccount) {
      res.json({
        isConnected: true,
        accountDetails: {
          username: socialAccount.username,
          platform: socialAccount.platform,
          accountId: socialAccount.accountId
        }
      });
    } else {
      res.json({
        isConnected: false,
        accountDetails: null
      });
    }
  } catch (error) {
    console.error('Error checking social account:', error);
    res.status(500).json({ error: 'Failed to check social account status' });
  }
});

// disconnect social account
app.delete('/api/v1/social-accounts/:platform', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    
    await SocialAccount.findOneAndUpdate(
      {
        userId: userId,  // Add userId to query
        platform: platform
      },
      {
        isActive: false
      }
    );
    
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// Get user client helper function
async function getUserClient(userId) {
  const user = await UserModel.findById(userId);
  if (!user?.twitterAccessToken) {
    throw new Error('Twitter credentials not found');
  }

  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: user.twitterAccessToken,
    accessSecret: user.twitterTokenSecret,
  });
}

// Post tweet
app.post('/api/v1/twitter/tweet', authenticateToken, async (req, res) => {
  try {
    const { text, mediaIds = [], scheduledTime } = req.body;
    const client = await getUserClient(req.user.id);

    if (scheduledTime) {
      await Post.create({
        userId: req.user.id,
        platform: ['twitter'],
        content: text,
        mediaIds,
        scheduledTime: new Date(scheduledTime),
        schedule: true
      });
      return res.status(200).json({ message: 'Tweet scheduled' });
    }

    const tweet = await client.v2.tweet({
      text,
      media: { media_ids: mediaIds }
    });

    res.status(200).json(tweet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload media
app.post('/api/v1/twitter/upload', authenticateToken, upload.single('media'), async (req, res) => {
  try {
    const client = await getUserClient(req.user.id);
    const mediaId = await client.v1.uploadMedia(req.file.buffer, {
      mimeType: req.file.mimetype
    });
    res.status(200).json({ mediaId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/v1/twitter/auth/credentials', authenticateToken, async (req, res) => {
  try {
    const { api_key, api_secret, access_token, access_token_secret } = req.body;
    
    const client = new TwitterApi({
      appKey: api_key,
      appSecret: api_secret,
      accessToken: access_token,
      accessSecret: access_token_secret,
    });

    const user = await client.v2.me();
    
    await UserModel.findByIdAndUpdate(req.user.id, {
      twitterAccessToken: access_token,
      twitterTokenSecret: access_token_secret,
      twitterUsername: user.data.username,
      twitterUserId: user.data.id
    });

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: 'Invalid credentials' });
  }
});

// Get twitter metrics
app.get('/api/v1/twitter/metrics', authenticateToken, async (req, res) => {
  try {
    const client = await getUserClient(req.user.id);
    const user = await UserModel.findById(req.user.id);

    const [userInfo, tweets] = await Promise.all([
      client.v2.user(user.twitterUserId),
      client.v2.userTimeline(user.twitterUserId, {
        expansions: ['attachments.media_keys'],
        'tweet.fields': ['public_metrics', 'created_at'],
        max_results: 100
      })
    ]);

    res.status(200).json({
      user: userInfo.data,
      tweets: tweets.data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Initialize scheduler on app start
app.listen(3000, async () => {
  console.log('Server running on port 3000');
  await scheduler.initializeScheduledPosts();
});