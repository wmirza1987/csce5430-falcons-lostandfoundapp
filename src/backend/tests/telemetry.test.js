const { startTelemetry } = require("../services/telemetry");

describe("telemetry", () => {
  const original = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    } else {
      process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = original;
    }
  });

  test("stays off without a connection string", () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    expect(startTelemetry()).toBe(false);
  });

  test("never starts under NODE_ENV=test even with a connection string", () => {
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = "InstrumentationKey=00000000-0000-0000-0000-000000000000";
    expect(startTelemetry()).toBe(false);
  });
});
