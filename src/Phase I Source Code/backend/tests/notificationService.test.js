const {
  createNotification,
  createMatchNotification,
} = require("../services/notificationService");

describe("Notification Service", () => {
  test("creates a basic notification object", () => {
    const notification = createNotification(
      "test",
      "Test message",
      "user123",
      "listing456"
    );

    expect(notification.type).toBe("test");
    expect(notification.message).toBe("Test message");
    expect(notification.userId).toBe("user123");
    expect(notification.relatedListingId).toBe("listing456");
    expect(notification.isRead).toBe(false);
    expect(notification.createdAt).toBeInstanceOf(Date);
  });

  test("creates a match notification", () => {
    const notification = createMatchNotification(
      "user123",
      "listing456"
    );

    expect(notification.type).toBe("match");
    expect(notification.userId).toBe("user123");
    expect(notification.relatedListingId).toBe("listing456");
    expect(notification.message).toBe(
      "A possible match was found for your listing."
    );
  });
});