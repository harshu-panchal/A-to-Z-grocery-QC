import { jest } from "@jest/globals";

const mockCreate = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockFindById = jest.fn();
const mockFind = jest.fn();
const mockFindByIdAndDelete = jest.fn();
const mockFindOne = jest.fn();
const mockInvalidate = jest.fn();
const mockHandleResponse = jest.fn();
const mockProductCount = jest.fn();
const CATEGORY_ID = "64b000000000000000000001";

// Category.find(...) is both awaited directly and chained .select().lean().
const findResult = (docs) => ({
  select: () => ({ lean: async () => docs }),
  lean: async () => docs,
  then: (resolve, reject) => Promise.resolve(docs).then(resolve, reject),
});

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    create: mockCreate,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findById: mockFindById,
    find: mockFind,
    findByIdAndDelete: mockFindByIdAndDelete,
    findOne: mockFindOne,
  },
}));

// deleteCategory refuses while products still use the category subtree.
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { countDocuments: mockProductCount },
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: jest.fn(),
  getOrSet: jest.fn(),
  getTTL: jest.fn(),
  invalidate: mockInvalidate,
}));

const {
  createCategory,
  updateCategory,
  deleteCategory,
} = await import("../app/controller/categoryController.js");

describe("cache invalidation on category mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ _id: "cat-1", name: "Fruits" });
    mockFindByIdAndUpdate.mockResolvedValue({ _id: "cat-1", name: "Updated" });
    mockFindById.mockReturnValue({
      select: () => ({
        lean: async () => ({ type: "header", parentId: null }),
      }),
    });
    mockFind.mockImplementation(() => findResult([]));
    mockProductCount.mockResolvedValue(0);
    mockFindByIdAndDelete.mockResolvedValue({ _id: "cat-1" });
    mockFindOne.mockReturnValue({ lean: async () => null });
  });

  test("createCategory invalidates category caches", async () => {
    await createCategory(
      {
        body: { name: "Fruits", slug: "fruits", type: "header", iconId: "electronics" },
      },
      {},
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ iconId: "electronics" }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:categories:*");
  });

  test("updateCategory invalidates category caches", async () => {
    await updateCategory(
      {
        params: { id: "507f1f77bcf86cd799439011" },
        body: { name: "Updated", iconId: "fashion" },
      },
      {},
    );
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      expect.objectContaining({
        $set: expect.objectContaining({ iconId: "fashion" }),
      }),
      expect.any(Object),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:categories:*");
  });

  test("deleteCategory invalidates category caches", async () => {
    await deleteCategory(
      {
        params: { id: CATEGORY_ID },
      },
      {},
    );
    expect(mockFindByIdAndDelete).toHaveBeenCalledWith(CATEGORY_ID);
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:categories:*");
  });

  test("deleteCategory leaves the cache alone when products still use the category", async () => {
    mockProductCount.mockResolvedValue(3);
    await deleteCategory({ params: { id: CATEGORY_ID } }, {});
    expect(mockHandleResponse).toHaveBeenCalledWith({}, 409, expect.stringContaining("3 products use"));
    expect(mockFindByIdAndDelete).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
