const TwitterStrategy = require('passport-twitter').Strategy;
const passport = require('passport');
const UserModel = require('../database/userModel');
const express = require('express');
const router = express.Router();

// Configure passport Twitter strategy
passport.use(new TwitterStrategy({
  consumerKey: process.env.TWITTER_API_KEY,
  consumerSecret: process.env.TWITTER_API_SECRET,
  callbackURL: "https://sc-content-generator-back.onrender.com/api/v1/auth/twitter/callback",
  includeEmail: true
},
async function(token, tokenSecret, profile, cb) {
  try {
    const user = await UserModel.findByIdAndUpdate(
      profile.id,
      {
        twitterId: profile.id,
        twitterUsername: profile.username,
        twitterAccessToken: token,
        twitterTokenSecret: tokenSecret,
        twitterProfile: profile._json
      },
      { new: true, upsert: true }
    );
    return cb(null, user);
  } catch (err) {
    return cb(err);
  }
}
));

// Twitter auth routes
router.get('/', (req, res, next) => {
const token = req.query.token;
req.session.returnToken = token;
passport.authenticate('twitter')(req, res, next);
});

router.get('/callback', 
passport.authenticate('twitter', { 
  failureRedirect: 'https://sc-content-generator-front.onrender.com/social-accounts?error=failed'
}),
(req, res) => {
  res.redirect('https://sc-content-generator-front.onrender.com/social-accounts?success=true');
}
);

// Error handler middleware
router.use((err, req, res, next) => {
if (err.name === 'SessionError') {
  res.redirect('https://sc-content-generator-front.onrender.com/social-accounts?error=session-expired');
} else {
  next(err);
}
});

module.exports = router;