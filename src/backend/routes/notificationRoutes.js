const express = require("express");
const {
  getNotifications,
  markAllRead,
  markRead,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/notifications", protect, getNotifications);
router.patch("/notifications/read-all", protect, markAllRead);
router.patch("/notifications/:id/read", protect, markRead);

module.exports = router;
