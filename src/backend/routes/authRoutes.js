const express = require("express");
const {
  registerUser,
  verifyEmail,
  loginUser,
  forgotPassword,
  resetPassword,
  updatePreferences,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const { rateLimit } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many authentication attempts. Please try again later.",
});

router.post("/register", authLimiter, registerUser);
router.get("/verify-email/:token", verifyEmail);
router.post("/login", authLimiter, loginUser);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);

router.get("/profile", protect, (req, res) => {
  res.status(200).json({
    message: "Protected route accessed successfully.",
    user: {
      id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      role: req.user.role,
      isEmailVerified: req.user.isEmailVerified,
      emailNotifications: req.user.emailNotifications,
    },
  });
});

router.patch("/preferences", protect, updatePreferences);

// Demonstrates FR AUTH 03 role enforcement. Full moderator/admin capabilities
// are out of Phase 1 scope (Deliverable 2, Section 9.3); this confirms the
// authorization check itself works end to end ahead of that.
router.get(
  "/admin-test",
  protect,
  authorizeRoles("admin"),
  (req, res) => {
    res.status(200).json({
      message: "Admin access granted.",
    });
  }
);

module.exports = router;
