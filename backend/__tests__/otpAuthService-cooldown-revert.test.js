import { jest } from "@jest/globals";

// Regression test for audit finding: customer OTP `otpLastSentAt` was
// persisted before the SMS dispatch was awaited, so a transient SMS
// provider failure left the resend cooldown armed even though nothing was
// delivered.

const mockSendSmsIndiaHubOtp = jest.fn();
const mockGetRedisClient = jest.fn(() => null);

let customerDoc;

const MockCustomer = {
  findOne: jest.fn(() => ({
    select: jest.fn().mockResolvedValue(customerDoc),
  })),
  create: jest.fn(),
  findById: jest.fn(),
};

jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: MockCustomer,
}));

jest.unstable_mockModule("../app/services/smsIndiaHubService.js", () => ({
  sendSmsIndiaHubOtp: mockSendSmsIndiaHubOtp,
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: mockGetRedisClient,
}));

const { issueCustomerOtp } = await import("../app/services/otpAuthService.js");

describe("otpAuthService cooldown revert on dispatch failure (audit fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRedisClient.mockReturnValue(null);
    process.env.USE_REAL_SMS = "true";
    process.env.NODE_ENV = "test";
    process.env.OTP_RESEND_COOLDOWN_SECONDS = "60";

    customerDoc = {
      _id: "cust-1",
      phone: "+919876543210",
      isVerified: true,
      otpLastSentAt: null,
      otpFailedAttempts: 0,
      otpLockedUntil: null,
      otpSessionVersion: 0,
      save: jest.fn().mockImplementation(function save() {
        return Promise.resolve(this);
      }),
    };
  });

  it("does not arm the resend cooldown when the SMS dispatch fails", async () => {
    mockSendSmsIndiaHubOtp.mockRejectedValueOnce(new Error("SMS gateway timeout"));

    await expect(
      issueCustomerOtp({ rawPhone: "+919876543210", flow: "login", ipAddress: "1.2.3.4" }),
    ).rejects.toThrow("SMS gateway timeout");

    // otpLastSentAt must have been reverted to null (its pre-attempt value),
    // not left set to "now" from the failed attempt.
    expect(customerDoc.otpLastSentAt).toBeNull();

    // A second attempt right away must not be blocked by the cooldown.
    mockSendSmsIndiaHubOtp.mockResolvedValueOnce(undefined);
    await expect(
      issueCustomerOtp({ rawPhone: "+919876543210", flow: "login", ipAddress: "1.2.3.4" }),
    ).resolves.toEqual(expect.objectContaining({ sent: true }));
  });

  it("still arms the cooldown normally when the dispatch succeeds", async () => {
    mockSendSmsIndiaHubOtp.mockResolvedValueOnce(undefined);

    await issueCustomerOtp({ rawPhone: "+919876543210", flow: "login", ipAddress: "1.2.3.4" });

    expect(customerDoc.otpLastSentAt).toBeInstanceOf(Date);

    await expect(
      issueCustomerOtp({ rawPhone: "+919876543210", flow: "login", ipAddress: "1.2.3.4" }),
    ).rejects.toThrow(/wait/i);
  });
});
