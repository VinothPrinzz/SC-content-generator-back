const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/brainly")

const UserSchema = new mongoose.Schema({
    username: {type: String, unique: true},
    userEmail: {type: String, unique:true, required:true},
    password: String
})

const UserModel = mongoose.model("User", UserSchema);


module.exports = UserModel;
