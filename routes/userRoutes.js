const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Register - GET
router.get("/register", (req, res) => {
  res.render("register");
});

// Register - POST
router.post("/register", async (req, res) => {
  const { name, email, phone, password } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.send("User already exists");

    const user = new User({ name, email, phone, password });
    await user.save();
    res.redirect("/login");
  } catch (err) {
    res.send("Error: " + err.message);
  }
});

// Login - GET
router.get("/login", (req, res) => {
  res.render("login");
});

// Login - POST
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.send("Invalid email");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.send("Incorrect password");

    req.session.user = user;
    res.redirect("/dashboard");
  } catch (err) {
    res.send("Error: " + err.message);
  }
});

// Dashboard (after login)
router.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("dashboard", { user: req.session.user });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;
