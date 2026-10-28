import { jest } from "@jest/globals";

// Banner validation shared by Create Sections and Hero & categories per page.

const mockProductExists = jest.fn();
const mockCategoryExists = jest.fn();
jest.unstable_mockModule("../app/models/product.js", () => ({ default: { exists: mockProductExists } }));
jest.unstable_mockModule("../app/models/category.js", () => ({ default: { exists: mockCategoryExists } }));

const { normalizeBannerItems, activeBanners, MAX_BANNERS } = await import("../app/services/bannerItems.js");

const ID = "6ac72c373c73e3e4d6167297";
const image = "https://res.cloudinary.com/demo/image/upload/banners/a.jpg";
const banner = (extra = {}) => ({ imageUrl: image, ...extra });

describe("normalizeBannerItems", () => {
  beforeEach(() => {
    mockProductExists.mockReset().mockResolvedValue({ _id: ID });
    mockCategoryExists.mockReset().mockResolvedValue({ _id: ID });
  });

  it("drops rows without an image and trims text", async () => {
    const items = await normalizeBannerItems([
      banner({ title: "  Big sale  ", subtitle: " today " }),
      { title: "no image" },
      { imageUrl: "   " },
    ]);
    expect(items).toEqual([
      { imageUrl: image, title: "Big sale", subtitle: "today", linkType: "none", linkValue: "", status: "active" },
    ]);
  });

  it("requires at least `min` banners", async () => {
    await expect(normalizeBannerItems([{ title: "x" }], { min: 1 })).rejects.toThrow("Add at least one banner image");
    await expect(normalizeBannerItems([])).resolves.toEqual([]);
  });

  it("rejects too many banners and non-http image addresses", async () => {
    const many = Array.from({ length: MAX_BANNERS + 1 }, () => banner());
    await expect(normalizeBannerItems(many)).rejects.toThrow(`at most ${MAX_BANNERS}`);
    await expect(normalizeBannerItems([banner({ imageUrl: "javascript:alert(1)" })])).rejects.toThrow("Banner 1");
  });

  it("rejects a link type with nothing chosen, naming the banner", async () => {
    await expect(
      normalizeBannerItems([banner(), banner({ linkType: "product", linkValue: "" })]),
    ).rejects.toThrow('Banner 2: choose where the banner should open');
  });

  it("checks that linked products and categories still exist", async () => {
    mockProductExists.mockResolvedValue(null);
    await expect(
      normalizeBannerItems([banner({ linkType: "product", linkValue: ID })]),
    ).rejects.toThrow("linked product no longer exists");

    mockCategoryExists.mockResolvedValue(null);
    await expect(
      normalizeBannerItems([banner({ linkType: "category", linkValue: ID })]),
    ).rejects.toThrow("linked category no longer exists");

    await expect(
      normalizeBannerItems([banner({ linkType: "product", linkValue: "not-an-id" })]),
    ).rejects.toThrow("linked product no longer exists");
  });

  it("looks categories up by their own type", async () => {
    await normalizeBannerItems([banner({ linkType: "subcategory", linkValue: ID })]);
    expect(mockCategoryExists).toHaveBeenCalledWith({ _id: ID, type: "subcategory" });
  });

  it("only accepts https:// or site-relative links for URL banners", async () => {
    await expect(normalizeBannerItems([banner({ linkType: "url", linkValue: "javascript:alert(1)" })])).rejects.toThrow(
      "must start with https:// or /",
    );
    await expect(normalizeBannerItems([banner({ linkType: "url", linkValue: "//evil.example" })])).rejects.toThrow(
      "must start with https:// or /",
    );
    const items = await normalizeBannerItems([
      banner({ linkType: "url", linkValue: "https://example.com/deal" }),
      banner({ linkType: "url", linkValue: "/offers" }),
    ]);
    expect(items.map((b) => b.linkValue)).toEqual(["https://example.com/deal", "/offers"]);
  });

  it("clears the link value when there is no link and keeps the hidden flag", async () => {
    const [item] = await normalizeBannerItems([banner({ linkType: "none", linkValue: "leftover", status: "inactive" })]);
    expect(item.linkValue).toBe("");
    expect(item.status).toBe("inactive");
  });

  it("limits title and subtitle length", async () => {
    await expect(normalizeBannerItems([banner({ title: "x".repeat(81) })])).rejects.toThrow("title is longer");
    await expect(normalizeBannerItems([banner({ subtitle: "x".repeat(161) })])).rejects.toThrow("subtitle is longer");
  });
});

describe("activeBanners", () => {
  it("hides banners switched off, keeps legacy ones with no status", () => {
    expect(activeBanners([{ imageUrl: "a" }, { imageUrl: "b", status: "inactive" }, { imageUrl: "c", status: "active" }])).toEqual([
      { imageUrl: "a" },
      { imageUrl: "c", status: "active" },
    ]);
    expect(activeBanners(undefined)).toEqual([]);
  });
});
