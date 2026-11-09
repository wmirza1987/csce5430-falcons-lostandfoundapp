const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const listingRoutes = require("./routes/listingRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Serves uploaded listing images (see middleware/uploadMiddleware.js).
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Team Falcons backend app is running",
  });
});

module.exports = app;