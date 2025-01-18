const jwt = require('jsonwebtoken');
const JWT_PASSWORD = "!23123"; // Your secret key

// Add this middleware function if you haven't already
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
  
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }
  
    jwt.verify(token, "JWT_PASSWORD", (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      req.user = user;
      next();
    });
  }

module.exports = authenticateToken;
