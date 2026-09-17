import { jest } from "@jest/globals";

// Regression test for audit finding M5: confirmUpload trusted the client's
// self-reported secureUrl/bytes/publicId and flipped status to "confirmed"
// with no server-side check that the asset actually exists in Cloudinary.
// A buggy or malicious client could call confirm without ever uploading
// (or after a failed upload) and produce a MediaMetadata row pointing at a
// non-existent asset.

const mockCloudinaryApiResource = jest.fn();
const mockConfig = jest.fn();

jest.unstable_mockModule("cloudinary", () => ({
  v2: {
    config: mockConfig,
    api: { resource: mockCloudinaryApiResource },
    utils: { api_sign_request: jest.fn() },
    uploader: { upload_stream: jest.fn() },
    url: jest.fn(() => "https://cdn.test/thumb.png"),
  },
}));

function makeMediaRecord(overrides = {}) {
  return {
    intentId: "intent-1",
    publicId: "products/abc123",
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
    getTransformedUrl: jest.fn(() => "https://cdn.test/thumb.png"),
    save: jest.fn().mockImplementation(function save() {
      return Promise.resolve(this);
    }),
    ...overrides,
  };
}

let mediaRecord;
const mockMediaMetadataFindOne = jest.fn(() => Promise.resolve(mediaRecord));

jest.unstable_mockModule("../app/models/mediaMetadata.js", () => ({
  default: { findOne: mockMediaMetadataFindOne },
}));

const { confirmUpload } = await import("../app/services/mediaService.js");

describe("mediaService.confirmUpload server-side verification (audit M5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STORAGE_PROVIDER = "cloudinary";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.MEDIA_MAX_FILE_SIZE = "10485760";
    mediaRecord = makeMediaRecord();
  });

  it("rejects confirmation when the asset does not exist on Cloudinary", async () => {
    mockCloudinaryApiResource.mockRejectedValue(new Error("Not Found"));

    await expect(
      confirmUpload({
        intentId: "intent-1",
        publicId: "products/abc123",
        secureUrl: "https://res.cloudinary.com/test-cloud/image/upload/products/abc123.jpg",
        bytes: 1000,
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(mediaRecord.status).not.toBe("confirmed");
    expect(mediaRecord.save).not.toHaveBeenCalled();
  });

  it("confirms normally once Cloudinary verifies the asset exists", async () => {
    mockCloudinaryApiResource.mockResolvedValue({ public_id: "products/abc123", bytes: 1000 });

    const result = await confirmUpload({
      intentId: "intent-1",
      publicId: "products/abc123",
      secureUrl: "https://res.cloudinary.com/test-cloud/image/upload/products/abc123.jpg",
      bytes: 1000,
      mimeType: "image/jpeg",
    });

    expect(mockCloudinaryApiResource).toHaveBeenCalledWith(
      "products/abc123",
      expect.objectContaining({ resource_type: "image" }),
    );
    expect(result.status).toBe("confirmed");
    expect(mediaRecord.save).toHaveBeenCalledTimes(1);
  });
});
