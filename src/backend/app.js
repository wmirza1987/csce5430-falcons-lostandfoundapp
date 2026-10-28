const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const listingRoutes = require("./routes/listingRoutes");
const matchRoutes = require("./routes/matchRoutes");
const claimRoutes = require("./routes/claimRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, server-side tests, and same-origin requests.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json({ limit: "1mb" }));

// Serves uploaded listing images (see middleware/uploadMiddleware.js).
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const apiRouter = express.Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/listings", listingRoutes);
apiRouter.use(matchRoutes);
apiRouter.use(claimRoutes);
apiRouter.use(notificationRoutes);

// Versioned API (IF-SW-01); the unversioned mount is kept as a compatibility
// alias for existing clients and tests.
app.use("/api/v1", apiRouter);
app.use("/api", apiRouter);

function healthCheck(req, res) {
  res.status(200).json({
    status: "ok",
    message: "Team Falcons backend app is running",
  });
}

app.get("/api/health", healthCheck);
app.get("/api/v1/health", healthCheck);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin is not allowed." });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body must be valid JSON." });
  }

  console.error(`Unhandled request error: ${error.message}`);

  return res.status(500).json({
    message: "An unexpected server error occurred.",
  });
});

module.exports = app;
