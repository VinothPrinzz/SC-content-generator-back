const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const UserModel = require("./database/userModel");
const Post = require("./database/postModel");
const Analytics = require("./database/analyticsModel");
const Stats = require("./database/statsModel");
const authenticateToken = require("./middleware");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true
}));


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
    const { postId } = req.params; // Expect `postId` in the request body

    try {
        // Find and update the post
        const updatedPost = await Post.findByIdAndUpdate(
        postId,
        { schedule: true }, // Set queue to true
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


// Backend: Update the endpoint to use authorization
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

// Fetch All Posts - Updated with userId check
app.get('/api/v1/posts', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.id;
      const posts = await Post.find({ userId: userId });
      res.status(200).json(posts);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Fetch Scheduled Posts - Updated with userId check
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


// Fetch Queued Posts - Updated with userId check
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

// Get single post - Updated with userId check for security
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
app.get('/api/v1/posts/analytics', async (req, res) => {
    try {
      const analytics = await Analytics.find();
      res.status(200).json(analytics);
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


// Delete Post - Updated with userId check for security
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


// Update Post - Updated with userId check for security
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


app.listen(3000);