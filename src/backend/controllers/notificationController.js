const {
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} = require("../services/notificationService");

async function getNotifications(req, res) {
  try {
    const notifications = await getUserNotifications(req.user._id, {
      unreadOnly: req.query.unreadOnly === "true",
      limit: req.query.limit,
    });

    const unreadCount = notifications.filter(
      (notification) => !notification.isRead
    ).length;

    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error(`Unable to retrieve notifications: ${error.message}`);
    return res.status(500).json({
      message: "Unable to retrieve notifications.",
    });
  }
}

async function markRead(req, res) {
  try {
    const notification = await markNotificationRead(
      req.params.id,
      req.user._id
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({ notification });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid notification id." });
    }

    console.error(`Unable to mark notification read: ${error.message}`);
    return res.status(500).json({
      message: "Unable to update notification.",
    });
  }
}

async function markAllRead(req, res) {
  try {
    const result = await markAllNotificationsRead(req.user._id);
    return res.status(200).json({
      message: "Notifications marked as read.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error(`Unable to mark notifications read: ${error.message}`);
    return res.status(500).json({
      message: "Unable to update notifications.",
    });
  }
}

module.exports = {
  getNotifications,
  markAllRead,
  markRead,
};
