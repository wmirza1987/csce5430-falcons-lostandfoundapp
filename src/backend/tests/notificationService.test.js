const {
  createNotification,
  getUserNotifications,
  markNotificationRead,
} = require("../services/notificationService");
const { createUser } = require("./helpers");

describe("Notification Service", () => {
  test("persists an in-app notification and respects disabled email", async () => {
    const user = await createUser({ emailNotifications: false });

    const notification = await createNotification({
      userId: user._id,
      type: "match",
      message: "A possible match was found.",
    });

    expect(notification).not.toBeNull();
    expect(notification.type).toBe("match");
    expect(notification.message).toBe("A possible match was found.");
    expect(notification.isRead).toBe(false);
    expect(notification.emailStatus).toBe("not_requested");
    expect(notification.emailAttempts).toBe(0);
  });

  test("lists a user's notifications and marks one as read", async () => {
    const user = await createUser({ emailNotifications: false });

    const notification = await createNotification({
      userId: user._id,
      type: "claim",
      message: "A new claim was submitted.",
    });

    const notifications = await getUserNotifications(user._id);
    expect(notifications).toHaveLength(1);

    const updated = await markNotificationRead(notification._id, user._id);
    expect(updated.isRead).toBe(true);

    const unread = await getUserNotifications(user._id, { unreadOnly: true });
    expect(unread).toHaveLength(0);
  });

  test("records a skipped email when SMTP is not configured", async () => {
    const user = await createUser({ emailNotifications: true });

    const notification = await createNotification({
      userId: user._id,
      type: "resolution",
      message: "The listing was resolved.",
    });

    expect(notification.emailStatus).toBe("skipped");
    expect(notification.emailAttempts).toBe(1);
  });
});
