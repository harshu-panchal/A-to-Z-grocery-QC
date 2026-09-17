import { jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

// Regression tests for the local storage provider's security
// requirements (feature spec Step 23): path-traversal protection and
// server-side image validation that doesn't just trust the
// client-declared MIME type.

let testRoot;
let localProvider;

beforeAll(async () => {
  testRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "media-storage-test-"));
  process.env.LOCAL_STORAGE_ROOT = testRoot;
  process.env.LOCAL_STORAGE_PUBLIC_URL = "https://example.com/uploads";
  localProvider = await import("../app/services/storage/providers/localProvider.js");
});

afterAll(async () => {
  await fs.promises.rm(testRoot, { recursive: true, force: true }).catch(() => {});
});

describe("localProvider path-traversal protection", () => {
  it("rejects a deleteFile() call whose localPath escapes the storage root", async () => {
    const maliciousMedia = {
      provider: "local",
      localPath: "../../../../etc/passwd",
    };

    await expect(localProvider.deleteFile(maliciousMedia)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects an absolute-path escape attempt disguised as a relative localPath", async () => {
    const maliciousMedia = {
      provider: "local",
      localPath: process.platform === "win32" ? "C:\\Windows\\System32\\config" : "/etc/shadow",
    };

    await expect(localProvider.deleteFile(maliciousMedia)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("still allows a legitimate, contained localPath through to the unlink attempt (ENOENT is tolerated, not a traversal rejection)", async () => {
    const legitimateMedia = {
      provider: "local",
      localPath: "images/products/does-not-exist.webp",
    };
    const result = await localProvider.deleteFile(legitimateMedia);
    expect(result).toEqual({ deleted: false, reason: "already-missing" });
  });
});

describe("localProvider server-side image validation", () => {
  it("rejects an upload whose bytes don't match any real image format, even if the client claims image/jpeg", async () => {
    const fakeImage = Buffer.from("this is definitely not a real jpeg file");

    await expect(
      localProvider.upload(fakeImage, { entityType: "product", mimeType: "image/jpeg", resourceType: "image" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts and stores a real (magic-byte-valid) PNG buffer, converting it to WebP", async () => {
    // Minimal valid PNG header + IHDR chunk is enough for sharp to decode
    // a 1x1 image — build one via a known-good base64 1x1 PNG.
    const onePixelPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const buffer = Buffer.from(onePixelPngBase64, "base64");

    const result = await localProvider.upload(buffer, {
      entityType: "product",
      mimeType: "image/png",
      resourceType: "image",
    });

    expect(result.provider).toBe("local");
    expect(result.format).toBe("webp");
    expect(result.url).toBe(`https://example.com/uploads/${result.localPath}`);

    const writtenPath = path.join(testRoot, result.localPath);
    const stat = await fs.promises.stat(writtenPath);
    expect(stat.isFile()).toBe(true);
  });
});
