const express = require("express");
const { flag, getMessages, getThreads, sendMessage } = require("../controllers/messageController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const { rateLimit } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

// NFR SEC 03: message sending is rate limited.
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "Too many messages sent. Please slow down and try again later.",
});

router.get("/claims/:id/messages", protect, getMessages);
router.post("/claims/:id/messages", protect, messageLimiter, sendMessage);
router.get("/messages/threads", protect, getThreads);
router.patch("/messages/:id/flag", protect, authorizeRoles("moderator", "admin"), flag);

module.exports = router;
