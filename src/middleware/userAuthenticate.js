const jwt = require('jsonwebtoken');
const JWT_PASSWORD = "!23123"; // Your secret key

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, "JWT_PASSWORD");
    req.user = decoded;
    req.session.jwtToken = token;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

module.exports = authenticateToken;
