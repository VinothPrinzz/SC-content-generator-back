const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@test.gc8su9s.mongodb.net/brainly?retryWrites=true&w=majority&appName=test")

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    userEmail: { type: String, unique: true, required: true },
    password: String
  });

const UserModel = mongoose.model("User", UserSchema);


module.exports = UserModel;
