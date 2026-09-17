import { jest } from "@jest/globals";

// Regression tests for the configurable media storage feature: the
// storage service must (1) upload to whichever provider is currently
// configured in MongoDB (Setting.mediaStorage.provider), defaulting to
// "cloudinary" when unset, and (2) always dispatch deletes by the
// media's own stored `provider` field — never by inspecting the URL
// (explicit hard rule from the feature spec: no
// `url.includes('cloudinary.com')`-style branching).

const mockSettingFindOne = jest.fn();
const mockMediaMetadataCreate = jest.fn();
const mockCloudinaryUpload = jest.fn();
const mockCloudinaryDelete = jest.fn();
const mockLocalUpload = jest.fn();
const mockLocalDelete = jest.fn();

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: mockSettingFindOne },
}));

jest.unstable_mockModule("../app/models/mediaMetadata.js", () => ({
  default: { create: mockMediaMetadataCreate },
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  getOrSet: jest.fn(async (key, fetchFn) => fetchFn()),
  invalidate: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../app/services/storage/providers/cloudinaryProvider.js", () => ({
  upload: mockCloudinaryUpload,
  deleteFile: mockCloudinaryDelete,
}));

jest.unstable_mockModule("../app/services/storage/providers/localProvider.js", () => ({
  upload: mockLocalUpload,
  deleteFile: mockLocalDelete,
}));

const storageService = await import("../app/services/storage/storageService.js");

function selectChain(returnValue) {
  return { select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(returnValue) })) };
}

describe("storageService provider dispatch (configurable media storage)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STORAGE_PROVIDER;
  });

  it("defaults to cloudinary when no Setting document exists yet (existing deployments)", async () => {
    mockSettingFindOne.mockReturnValue(selectChain(null));
    const provider = await storageService.getCurrentProvider();
    expect(provider).toBe("cloudinary");
  });

  it("uses the DB-configured provider once an admin has set it to local", async () => {
    mockSettingFindOne.mockReturnValue(selectChain({ mediaStorage: { provider: "local" } }));
    const provider = await storageService.getCurrentProvider();
    expect(provider).toBe("local");
  });

  it("routes upload() to the local provider when local is configured, not cloudinary", async () => {
    mockSettingFindOne.mockReturnValue(selectChain({ mediaStorage: { provider: "local" } }));
    mockLocalUpload.mockResolvedValue({
      provider: "local",
      url: "https://example.com/uploads/images/products/abc.webp",
      objectKey: "images/products/abc.webp",
      localPath: "images/products/abc.webp",
      publicId: null,
      mimeType: "image/webp",
      size: 1234,
      format: "webp",
    });
    mockMediaMetadataCreate.mockResolvedValue({ _id: "media-1" });

    const result = await storageService.upload(Buffer.from("fake"), {
      entityType: "product",
      mimeType: "image/jpeg",
      resourceType: "image",
    });

    expect(mockLocalUpload).toHaveBeenCalledTimes(1);
    expect(mockCloudinaryUpload).not.toHaveBeenCalled();
    expect(result.provider).toBe("local");
    expect(mockMediaMetadataCreate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "local", localPath: "images/products/abc.webp" }),
    );
  });

  it("routes upload() to cloudinary when that's the configured provider", async () => {
    mockSettingFindOne.mockReturnValue(selectChain({ mediaStorage: { provider: "cloudinary" } }));
    mockCloudinaryUpload.mockResolvedValue({
      provider: "cloudinary",
      url: "https://res.cloudinary.com/demo/image/upload/products/abc.jpg",
      objectKey: "products/abc",
      publicId: "products/abc",
      localPath: null,
      mimeType: "image/jpeg",
      size: 5678,
      format: "jpg",
    });
    mockMediaMetadataCreate.mockResolvedValue({ _id: "media-2" });

    const result = await storageService.upload(Buffer.from("fake"), {
      entityType: "product",
      mimeType: "image/jpeg",
      resourceType: "image",
    });

    expect(mockCloudinaryUpload).toHaveBeenCalledTimes(1);
    expect(mockLocalUpload).not.toHaveBeenCalled();
    expect(result.provider).toBe("cloudinary");
  });

  it("deletes via the record's stored provider field, never by inspecting the URL", async () => {
    // Deliberately adversarial: a "local" record whose URL looks like a
    // Cloudinary URL. If deletion were ever inferred from the URL string
    // instead of the stored provider field, this would wrongly call the
    // Cloudinary provider instead of the local one.
    const localMediaWithCloudinaryLikeUrl = {
      provider: "local",
      localPath: "images/products/abc.webp",
      secureUrl: "https://res.cloudinary.com/totally-fake/image/upload/products/abc.jpg",
    };
    mockLocalDelete.mockResolvedValue({ deleted: true });

    await storageService.deleteFile(localMediaWithCloudinaryLikeUrl);

    expect(mockLocalDelete).toHaveBeenCalledWith(localMediaWithCloudinaryLikeUrl);
    expect(mockCloudinaryDelete).not.toHaveBeenCalled();
  });

  it("cleans up the just-uploaded file if the MediaMetadata DB write fails (no orphaned upload)", async () => {
    mockSettingFindOne.mockReturnValue(selectChain({ mediaStorage: { provider: "cloudinary" } }));
    mockCloudinaryUpload.mockResolvedValue({
      provider: "cloudinary",
      url: "https://res.cloudinary.com/demo/image/upload/products/orphan.jpg",
      objectKey: "products/orphan",
      publicId: "products/orphan",
      localPath: null,
      mimeType: "image/jpeg",
      size: 100,
      format: "jpg",
    });
    mockMediaMetadataCreate.mockRejectedValue(new Error("Mongo write failed"));
    mockCloudinaryDelete.mockResolvedValue({ deleted: true });

    await expect(
      storageService.upload(Buffer.from("fake"), { entityType: "product", mimeType: "image/jpeg", resourceType: "image" }),
    ).rejects.toThrow("Mongo write failed");

    expect(mockCloudinaryDelete).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: "products/orphan" }),
    );
  });

  it("replace() never deletes the old file if the new upload fails (upload happens before delete)", async () => {
    mockSettingFindOne.mockReturnValue(selectChain({ mediaStorage: { provider: "cloudinary" } }));
    mockCloudinaryUpload.mockRejectedValue(new Error("Cloudinary is down"));

    await expect(
      storageService.replace("https://res.cloudinary.com/demo/image/upload/products/old.jpg", Buffer.from("new"), {
        entityType: "product",
        mimeType: "image/jpeg",
        resourceType: "image",
      }),
    ).rejects.toThrow("Cloudinary is down");

    expect(mockCloudinaryDelete).not.toHaveBeenCalled();
    expect(mockLocalDelete).not.toHaveBeenCalled();
  });
});
