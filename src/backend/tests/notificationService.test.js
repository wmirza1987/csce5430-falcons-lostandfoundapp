jest.mock("../services/emailService", () => ({
  isSmtpConfigured: jest.fn(() => true),
  sendMail: jest.fn(),
  sendNotificationEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

const request = require("supertest");
const app = require("../app");
const Notification = require("../models/Notification");
const User = require("../models/User");
const emailService = require("../services/emailService");
const {
  createNotification,
  getUserNotifications,
  markNotificationRead,
  retryFailedEmails,
  notifyNewClaim,
  removeContactDetails,
} = require("../services/notificationService");
const { authHeader, createMatchedPair, createUser } = require("./helpers");

const SENT = { delivered: true, attempts: 1 };

beforeEach(() => {
  emailService.sendNotificationEmail.mockReset();
  emailService.sendNotificationEmail.mockResolvedValue(SENT);
});

describe("In-app and email notifications (FR-NOTIF-01)", () => {
  test("UT-NOTIF-01: an in-app notification is persisted for a match", async () => {
    const user = await createUser({ emailNotifications: false });
    const notice = await createNotification({ userId: user._id, type: "match", message: "Possible match" });

    expect(notice).not.toBeNull();
    expect(await Notification.countDocuments({ user: user._id })).toBe(1);
    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
  });

  test("UT-NOTIF-02 and IF-COM-04: an opted-in user receives an email that links to the action", async () => {
    const user = await createUser({ emailNotifications: true });
    const notice = await createNotification({
      userId: user._id,
      type: "match",
      message: "Possible match",
      actionPath: "/matches/abc/claim",
    });

    expect(emailService.sendNotificationEmail).toHaveBeenCalledTimes(1);
    const sent = emailService.sendNotificationEmail.mock.calls[0][0];
    expect(sent.to).toBe(user.email);
    expect(sent.text).toContain("/matches/abc/claim");
    expect((await Notification.findById(notice._id)).emailStatus).toBe("sent");
  });

  test("UT-NOTIF-04 and UT-PRIV-09: the owner is emailed about a claim without the evidence text", async () => {
    const setup = await createMatchedPair();
    await User.updateOne({ _id: setup.finder._id }, { $set: { emailNotifications: true } });
    const claimStub = { _id: "64b000000000000000000001" };

    await notifyNewClaim(claimStub, setup.found);

    const sent = emailService.sendNotificationEmail.mock.calls.at(-1)[0];
    expect(sent.subject).toBe("New claim submitted");
    expect(sent.text).toContain("Review the evidence in the app");
  });

  test("UT-NOTIF-07: a user who opted out gets in-app only, and no email is attempted", async () => {
    const user = await createUser({ emailNotifications: false });
    const notice = await createNotification({ userId: user._id, type: "claim", message: "New claim" });

    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(notice.emailStatus).toBe("not_requested");
  });

  test("UT-NOTIF-08: a failed send is recorded as failed, never as sent", async () => {
    emailService.sendNotificationEmail.mockResolvedValueOnce({ delivered: false, reason: "smtp_error" });
    const user = await createUser({ emailNotifications: true });
    const notice = await createNotification({ userId: user._id, type: "claim", message: "New claim" });

    const stored = await Notification.findById(notice._id);
    expect(stored.emailStatus).toBe("failed");
    expect(stored.emailAttempts).toBe(1);
  });

  test("NFR REL 02: an email provider that throws does not stop the in-app notification", async () => {
    emailService.sendNotificationEmail.mockRejectedValueOnce(new Error("provider down"));
    const user = await createUser({ emailNotifications: true });

    const notice = await createNotification({ userId: user._id, type: "claim", message: "New claim" });

    expect(notice).not.toBeNull();
    expect((await Notification.findById(notice._id)).emailStatus).toBe("failed");
  });

  test("UT-NOTIF-09: failed emails are retried and marked sent once delivered", async () => {
    emailService.sendNotificationEmail.mockResolvedValueOnce({ delivered: false, reason: "smtp_error" });
    const user = await createUser({ emailNotifications: true });
    const notice = await createNotification({ userId: user._id, type: "claim", message: "New claim" });

    const result = await retryFailedEmails();

    expect(result.retried).toBe(1);
    expect((await Notification.findById(notice._id)).emailStatus).toBe("sent");
  });

  test("no SMTP configuration records the email as skipped", async () => {
    emailService.sendNotificationEmail.mockResolvedValueOnce({ delivered: false, reason: "smtp_not_configured" });
    const user = await createUser({ emailNotifications: true });
    const notice = await createNotification({ userId: user._id, type: "claim", message: "New claim" });

    expect((await Notification.findById(notice._id)).emailStatus).toBe("skipped");
  });
});

describe("Notification privacy (FR-NOTIF-02, NFR-PRIV-01)", () => {
  test("UT-NOTIF-10: email addresses and phone numbers are removed from notification text", async () => {
    const user = await createUser({ emailNotifications: true });
    const notice = await createNotification({
      userId: user._id,
      type: "claim",
      message: "Contact jane.doe@my.unt.edu or 940-555-0147",
    });

    expect(notice.message).not.toMatch(/@/);
    expect(notice.message).not.toMatch(/555-0147/);
    expect(removeContactDetails("ping a@b.co")).toBe("ping [contact removed]");
  });

  test("UT-PRIV-01: a match notification does not contain private listing details", async () => {
    const setup = await createMatchedPair();
    const { notifyPotentialMatch } = require("../services/notificationService");

    await notifyPotentialMatch({ match: setup.match, lostListing: setup.lost, foundListing: setup.found });

    const notices = await Notification.find({}).select("+emailBody").lean();
    for (const notice of notices) {
      expect(notice.message).not.toContain("Engraved initials");
      expect(notice.emailBody).not.toContain("Engraved initials");
    }
  });
});

describe("Notification feed", () => {
  test("lists a user's notifications and marks one as read", async () => {
    const user = await createUser({ emailNotifications: false });
    const notice = await createNotification({ userId: user._id, type: "match", message: "A match" });

    const feed = await getUserNotifications(user._id);
    expect(feed).toHaveLength(1);

    await markNotificationRead(notice._id, user._id);
    expect((await Notification.findById(notice._id)).isRead).toBe(true);
  });

  test("the notification endpoint returns only the caller's notifications", async () => {
    const user = await createUser({ emailNotifications: false });
    const other = await createUser({ emailNotifications: false });
    await createNotification({ userId: other._id, type: "match", message: "Not yours" });

    const response = await request(app).get("/api/v1/notifications").set(authHeader(user));

    expect(response.statusCode).toBe(200);
    expect(response.body.notifications).toHaveLength(0);
  });
});
