import { jest } from "@jest/globals";

// Regression tests for the admin media-storage settings endpoints
// (GET/PUT /api/admin/settings/storage): default value for existing
// deployments, and rejection of invalid provider values.

const mockSettingFindOne = jest.fn();
const mockSettingFindOneAndUpdate = jest.fn();
const mockInvalidateProviderCache = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: mockSettingFindOne,
    findOneAndUpdate: mockSettingFindOneAndUpdate,
  },
}));

jest.unstable_mockModule("../app/services/storage/storageService.js", () => ({
  invalidateProviderCache: mockInvalidateProviderCache,
}));

const { getStorageSettings, updateStorageSettings } = await import(
  "../app/controller/admin/storageSettingsController.js"
);

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("admin storage settings controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defaults to cloudinary when no Setting document has a mediaStorage field yet", async () => {
    mockSettingFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    const res = makeRes();

    await getStorageSettings({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.result.provider).toBe("cloudinary");
  });

  it("returns the DB-configured provider once an admin has set it", async () => {
    mockSettingFindOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ mediaStorage: { provider: "local" } }) }),
    });
    const res = makeRes();

    await getStorageSettings({}, res);

    expect(res.json.mock.calls[0][0].result.provider).toBe("local");
  });

  it("rejects an update with an unsupported provider value", async () => {
    const req = { body: { provider: "s3" } };
    const res = makeRes();

    await updateStorageSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSettingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("persists a valid provider change and invalidates the cached provider", async () => {
    mockSettingFindOneAndUpdate.mockResolvedValue({ mediaStorage: { provider: "local" } });
    const req = { body: { provider: "local" } };
    const res = makeRes();

    await updateStorageSettings(req, res);

    expect(mockSettingFindOneAndUpdate).toHaveBeenCalledWith(
      {},
      { $set: { "mediaStorage.provider": "local" } },
      { new: true, upsert: true },
    );
    expect(mockInvalidateProviderCache).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].result.provider).toBe("local");
  });
});
