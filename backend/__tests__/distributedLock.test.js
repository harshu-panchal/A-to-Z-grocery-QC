import { jest } from "@jest/globals";

// Regression test for audit finding M2: withdrawal requests read the
// available balance and wrote the withdrawal transaction with nothing
// tying the two together, so two concurrent requests could both pass the
// balance check before either write was visible to the other.

const mockSet = jest.fn();
const mockGet = jest.fn();
const mockDel = jest.fn();
const mockGetRedisClient = jest.fn();

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: mockGetRedisClient,
}));

const { withLock } = await import("../app/utils/distributedLock.js");

describe("withLock (audit M2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRedisClient.mockReturnValue({ set: mockSet, get: mockGet, del: mockDel });
  });

  it("runs the function and releases the lock on success", async () => {
    mockSet.mockResolvedValue("OK");
    mockGet.mockResolvedValue(null); // will be re-set below to match

    const fn = jest.fn().mockResolvedValue("result");
    // Simulate get() returning the exact lock value that was set, so release proceeds.
    mockSet.mockImplementation(async (key, value) => {
      mockGet.mockResolvedValue(value);
      return "OK";
    });

    const result = await withLock("withdrawal:lock:seller:1", 10_000, fn);

    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith("withdrawal:lock:seller:1");
  });

  it("rejects a second concurrent call for the same key while the first is still running", async () => {
    // First call acquires the lock (SET NX succeeds).
    mockSet.mockResolvedValueOnce("OK");
    // Second concurrent call fails to acquire (SET NX returns null because key already exists).
    mockSet.mockResolvedValueOnce(null);

    let releaseFirst;
    const firstFn = jest.fn(
      () => new Promise((resolve) => { releaseFirst = resolve; }),
    );
    const secondFn = jest.fn().mockResolvedValue("should not run");

    const firstCall = withLock("withdrawal:lock:seller:1", 10_000, firstFn);
    const secondCall = withLock("withdrawal:lock:seller:1", 10_000, secondFn);

    await expect(secondCall).rejects.toMatchObject({ statusCode: 409 });
    expect(secondFn).not.toHaveBeenCalled();

    releaseFirst("first result");
    await expect(firstCall).resolves.toBe("first result");
  });

  it("runs the function directly (no lock) when Redis is unavailable, so withdrawals aren't blocked by a Redis outage", async () => {
    mockGetRedisClient.mockReturnValue(null);
    const fn = jest.fn().mockResolvedValue("ran-without-lock");

    const result = await withLock("withdrawal:lock:seller:1", 10_000, fn);

    expect(result).toBe("ran-without-lock");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates the wrapped function's error and still releases the lock", async () => {
    mockSet.mockImplementation(async (key, value) => {
      mockGet.mockResolvedValue(value);
      return "OK";
    });
    const err = Object.assign(new Error("Insufficient balance"), { statusCode: 400 });
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withLock("withdrawal:lock:seller:1", 10_000, fn)).rejects.toThrow(
      "Insufficient balance",
    );
    expect(mockDel).toHaveBeenCalledWith("withdrawal:lock:seller:1");
  });
});
