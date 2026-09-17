import { jest } from "@jest/globals";

// Regression test for audit finding: createCategory swallowed a Cloudinary
// upload failure (log-only) and still created the category with no image
// and a success response — updateCategory correctly fails the request on
// the same error, so createCategory should too.

const mockCategoryCreate = jest.fn();
const mockUploadToCloudinary = jest.fn();
const mockInvalidate = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    create: mockCategoryCreate,
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    findById: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
  },
}));

jest.unstable_mockModule("../app/services/mediaService.js", () => ({
  uploadToCloudinary: mockUploadToCloudinary,
  // createCategory (tested below) only calls uploadToCloudinary; but
  // categoryController.js also imports replaceMedia (used by
  // updateCategory) from this module, and Jest's ESM mocking requires
  // every imported named binding to exist on the mock.
  replaceMedia: jest.fn(),
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: jest.fn(),
  getOrSet: jest.fn(),
  getTTL: jest.fn(),
  invalidate: mockInvalidate,
}));

jest.unstable_mockModule("../app/services/entityNameCache.js", () => ({
  invalidateCategoryName: jest.fn(),
}));

const { createCategory } = await import("../app/controller/categoryController.js");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("createCategory image-upload failure handling (audit fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fails the request instead of silently creating a category with no image", async () => {
    mockUploadToCloudinary.mockRejectedValue(new Error("Cloudinary timeout"));

    const req = {
      body: { name: "Fruits", slug: "fruits", type: "header" },
      file: { buffer: Buffer.from("fake"), mimetype: "image/png" },
    };
    const res = makeRes();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCategoryCreate).not.toHaveBeenCalled();
  });

  it("still creates the category successfully when the upload succeeds", async () => {
    mockUploadToCloudinary.mockResolvedValue("https://cdn.test/fruits.png");
    mockCategoryCreate.mockResolvedValue({ _id: "cat-1", name: "Fruits" });

    const req = {
      body: { name: "Fruits", slug: "fruits", type: "header" },
      file: { buffer: Buffer.from("fake"), mimetype: "image/png" },
    };
    const res = makeRes();

    await createCategory(req, res);

    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ image: "https://cdn.test/fruits.png" }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
