const express = require("express");
const { create, decide, index, show } = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const { rateLimit } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

// Any signed-in user can report content. Rate limited to discourage abuse.
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many reports submitted. Please slow down.",
});

router.post("/reports", protect, reportLimiter, create);

// Moderation queue is restricted to staff.
router.get("/reports", protect, authorizeRoles("moderator", "admin"), index);
router.get("/reports/:id", protect, authorizeRoles("moderator", "admin"), show);
router.patch("/reports/:id/decision", protect, authorizeRoles("moderator", "admin"), decide);

module.exports = router;
