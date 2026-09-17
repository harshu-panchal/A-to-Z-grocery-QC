import mongoose from "mongoose";
import MediaMetadata from "../app/models/mediaMetadata.js";

// Regression test: settingsController.uploadSettingsImage (logo/favicon
// uploads) routes through mediaService.folderToEntityType("settings"),
// which resolves entityType to "settings". Before this fix,
// MediaMetadata.entityType's enum didn't include "settings", so every
// logo/favicon upload through the new storageService would fail
// Mongoose schema validation at MediaMetadata.create() time.

describe("MediaMetadata entityType enum includes settings", () => {
  it("passes schema validation with entityType 'settings'", () => {
    const doc = new MediaMetadata({
      provider: "local",
      objectKey: "images/settings/logo.webp",
      localPath: "images/settings/logo.webp",
      secureUrl: "https://example.com/uploads/images/settings/logo.webp",
      resourceType: "image",
      entityType: "settings",
    });

    const error = doc.validateSync();
    expect(error).toBeUndefined();
  });

  it("still rejects a genuinely invalid entityType", () => {
    const doc = new MediaMetadata({
      provider: "local",
      objectKey: "images/other/x.webp",
      localPath: "images/other/x.webp",
      secureUrl: "https://example.com/uploads/images/other/x.webp",
      resourceType: "image",
      entityType: "not-a-real-type",
    });

    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.entityType).toBeDefined();
  });
});
