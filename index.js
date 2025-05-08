require("dotenv").config(); // Add this at the top of the file
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const winston = require("winston");
const expressLayouts = require("express-ejs-layouts");

const app = express();
const MONGO_URL = "mongodb://127.0.0.1:27017/waterbilling"; // Fixed variable name
const PORT = 5000;

// Logger setup
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
  ],
});

// Connect to MongoDB
mongoose
  .connect(MONGO_URL)
  .then(() => logger.info("MongoDB connected"))
  .catch((err) => logger.error("MongoDB connection error:", err));

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method")); // For handling PUT/PATCH requests
app.use(expressLayouts); // Use express-ejs-layouts middleware
app.use(express.static("public")); // Use static files for CSS

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallbacksecret", // Use environment variable
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URL }),
  })
);

app.use(flash());

// Middleware to pass user to all views
app.use((req, res, next) => {
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  res.locals.user = req.session.user || null; // Pass the user from the session to all views
  next();
});

// Setting up EJS
app.set("view engine", "ejs");
app.set("layout", "layout"); // Set the default layout file

// User schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  canCount: { type: Number, default: 0 },
  monthlyTotal: { type: Number, default: 0 },
  canHistory: [
    { date: Date, countChanged: Number, totalCans: Number, totalPrice: Number },
  ],
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

// Routes

// Home page
app.get("/", (req, res) => {
  res.render("index", {
    title: "Home - Water Billing System",
  });
});

// Register page
app.get("/register", (req, res) => {
  res.render("register", {
    title: "Register - Water Billing System",
  });
});

// Handle registration
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    req.flash("success", "Registration successful. Please log in.");
    res.redirect("/login");
  } catch (err) {
    if (err.code === 11000) {
      req.flash("error", "Email already exists.");
    } else {
      req.flash("error", "An error occurred. Please try again.");
    }
    res.redirect("/register");
  }
});

// Login page
app.get("/login", (req, res) => {
  res.render("login", {
    title: "Login - Water Billing System",
  });
});

// Handle login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    req.flash("error", "Invalid email or password.");
    return res.redirect("/login");
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (isMatch) {
    req.session.user = user;
    req.flash("success", "Login successful.");
    res.redirect("/dashboard");
  } else {
    req.flash("error", "Invalid email or password.");
    res.redirect("/login");
  }
});

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  req.flash("error", "Please log in to access this page.");
  res.redirect("/login");
}

// ✅ CLEANED: View user details (admin only)
app.get("/user/:id", isAuthenticated, async (req, res) => {
  try {
    if (req.session.user.role !== "admin") {
      req.flash("error", "Access denied. Admins only.");
      return res.redirect("/dashboard");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    res.render("user", {
      user,
      title: `User Details - ${user.name} - Water Billing System`,
    });
  } catch (err) {
    console.error("Error fetching user details:", err);
    req.flash("error", "An error occurred while fetching user details.");
    res.redirect("/admin");
  }
});

app.get("/user", (req, res) => {
  req.flash("error", "User ID is required.");
  res.redirect("/admin");
});

// Dashboard
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/login");
    }

    user.canHistory = user.canHistory.map((entry) => ({
      ...entry,
      date: new Date(entry.date),
    }));

    res.render("dashboard", {
      user,
      title: "Dashboard - Water Billing System",
    });
  } catch (err) {
    console.error("Error loading dashboard:", err);
    req.flash("error", "An error occurred while loading the dashboard.");
    res.redirect("/login");
  }
});

// Add water cans
app.post("/dashboard/add-cans", isAuthenticated, async (req, res) => {
  const { countChanged, price } = req.body;
  const user = await User.findById(req.session.user._id);

  if (!user) {
    req.flash("error", "User not found.");
    return res.redirect("/dashboard");
  }

  const totalCans = user.canCount + parseInt(countChanged);
  const totalPrice = parseInt(price);

  user.canCount = totalCans;
  user.monthlyTotal += totalPrice;
  user.canHistory.push({
    date: new Date(),
    countChanged: parseInt(countChanged),
    totalCans,
    totalPrice,
  });

  await user.save();
  req.session.user = user;
  req.flash("success", "Water cans added successfully.");
  res.redirect("/dashboard");
});

// Admin panel
app.get("/admin", isAuthenticated, async (req, res) => {
  try {
    if (req.session.user.role !== "admin") {
      req.flash("error", "Access denied. Admins only.");
      return res.redirect("/dashboard");
    }

    const users = await User.find({});
    res.render("admin", {
      users,
      title: "Admin Dashboard - Water Billing System",
    });
  } catch (err) {
    console.error("Error fetching users for admin panel:", err);
    req.flash("error", "An error occurred while loading the admin panel.");
    res.redirect("/dashboard");
  }
});

// Create admin
app.get("/create-admin", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash("jayram94", 10);
    const adminUser = new User({
      name: "Admin",
      email: "jayram@gmail.com", // Fixed formatting
      password: hashedPassword,
      role: "admin",
    });
    await adminUser.save();
    res.send("Admin user created successfully. You can now log in as admin.");
  } catch (err) {
    res.status(500).send("Error creating admin user: " + err.message);
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect("/dashboard");
    }
    res.redirect("/login");
  });
});

app.post("/user/:id/update-cans", isAuthenticated, async (req, res) => {
  const { countChanged } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    req.flash("error", "User not found.");
    return res.redirect("/admin");
  }

  const updatedCans = user.canCount + parseInt(countChanged);
  user.canCount = updatedCans;
  await user.save();
  req.flash("success", "Cans updated successfully.");
  res.redirect(`/user/${user._id}`);
});


// Delete User Route
app.post('/user/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }
    
    // Delete the user
    await user.remove();
    
    // Show success message and redirect to admin panel
    req.flash("success", "User deleted successfully.");
    res.redirect("/admin"); // Adjust this to redirect to the right admin panel page
  } catch (err) {
    req.flash("error", "An error occurred.");
    res.redirect("/admin");
  }
});

// Add/Remove Cans Route
app.post('/user/:id/update-cans', isAuthenticated, async (req, res) => {
  try {
    const { countChanged } = req.body; // Can count to be added or subtracted
    const user = await User.findById(req.params.id);

    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    // Update the cans count
    user.canCount += parseInt(countChanged); // Adds or subtracts based on the input value

    // Save the user with the updated can count
    await user.save();

    // Optional: Add can history entry
    user.canHistory.push({
      date: new Date(),
      countChanged: parseInt(countChanged),
      totalCans: user.canCount,
      totalPrice: user.canCount * pricePerCan, // Adjust this to your price calculation logic
    });

    // Save the can history
    await user.save();

    req.flash("success", `Cans updated successfully. New total: ${user.canCount}`);
    res.redirect(`/user/${user._id}`);
  } catch (err) {
    req.flash("error", "An error occurred.");
    res.redirect("/admin");
  }
});


// Back route
app.get("/back", (req, res) => {
  res.redirect("/login");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
