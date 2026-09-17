import { jest } from "@jest/globals";

// Regression test for audit finding: the SMS India Hub gateway URL
// defaulted to plain HTTP, so OTP codes and the API key travelled
// unencrypted whenever SMS_INDIA_HUB_URL wasn't explicitly overridden.

const mockAxiosGet = jest.fn().mockResolvedValue({ data: "000|ok" });

jest.unstable_mockModule("axios", () => ({
  default: { get: mockAxiosGet },
}));

const { sendSmsIndiaHubOtp } = await import("../app/services/smsIndiaHubService.js");

describe("smsIndiaHubService default gateway URL (audit fix)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SMS_INDIA_HUB_URL;
    process.env.SMS_INDIA_HUB_API_KEY = "test-key";
    process.env.SMS_INDIA_HUB_SENDER_ID = "TESTSN";
    process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID = "12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses an https:// URL by default when SMS_INDIA_HUB_URL is not set", async () => {
    await sendSmsIndiaHubOtp({ phone: "9876543210", otp: "1234" });

    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    const [calledUrl] = mockAxiosGet.mock.calls[0];
    expect(calledUrl.startsWith("https://")).toBe(true);
  });
});
