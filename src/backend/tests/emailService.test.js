const mockBeginSend = jest.fn();

jest.mock("@azure/communication-email", () => ({
  EmailClient: function () {
    return { beginSend: mockBeginSend };
  },
}));
jest.mock("@azure/identity", () => ({ DefaultAzureCredential: function () {} }));

const emailService = require("../services/emailService");

const saved = { endpoint: process.env.ACS_ENDPOINT, from: process.env.EMAIL_FROM };

function restore(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  restore("ACS_ENDPOINT", saved.endpoint);
  restore("EMAIL_FROM", saved.from);
  emailService.resetClient();
  mockBeginSend.mockReset();
});

describe("emailService (ACS)", () => {
  test("returns email_not_configured when settings are missing", async () => {
    delete process.env.ACS_ENDPOINT;
    delete process.env.EMAIL_FROM;

    expect(await emailService.sendVerificationEmail("a@my.unt.edu", "tok")).toEqual({
      delivered: false,
      reason: "email_not_configured",
    });
    expect(mockBeginSend).not.toHaveBeenCalled();
  });

  test("sends through beginSend and reports delivery", async () => {
    process.env.ACS_ENDPOINT = "https://example.communication.azure.com";
    process.env.EMAIL_FROM = "noreply@example.azurecomm.net";
    mockBeginSend.mockResolvedValue({ pollUntilDone: async () => ({ status: "Succeeded" }) });

    const result = await emailService.sendPasswordResetEmail("a@my.unt.edu", "tok");

    expect(result).toEqual({ delivered: true });
    expect(mockBeginSend.mock.calls[0][0]).toMatchObject({
      senderAddress: "noreply@example.azurecomm.net",
      recipients: { to: [{ address: "a@my.unt.edu" }] },
    });
    expect(mockBeginSend.mock.calls[0][0].content.plainText).toContain("/reset-password/tok");
  });

  test("a failed send throws from sendMail and is reported by sendNotificationEmail", async () => {
    process.env.ACS_ENDPOINT = "https://example.communication.azure.com";
    process.env.EMAIL_FROM = "noreply@example.azurecomm.net";
    mockBeginSend.mockResolvedValue({ pollUntilDone: async () => ({ status: "Failed" }) });

    await expect(
      emailService.sendMail({ to: "a@my.unt.edu", subject: "s", text: "t" })
    ).rejects.toThrow(/Failed/);

    const result = await emailService.sendNotificationEmail({
      to: "a@my.unt.edu",
      subject: "s",
      text: "t",
    });
    expect(result).toMatchObject({ delivered: false, attempts: 2, reason: "email_error" });
  });
});
