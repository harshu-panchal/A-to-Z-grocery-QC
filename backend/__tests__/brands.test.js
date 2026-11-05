process.env.REDIS_DISABLED = "true";

const { cleanBrandName, brandKey, similarBrands } = await import("../app/services/brandService.js");

const list = ["Amul", "Aashirvaad", "Tata Sampann", "Fortune", "Mother Dairy"].map((name) => ({ _id: name, name, key: brandKey(name) }));

describe("brand names", () => {
  it("cleans spacing and capitalises an all-lowercase name", () => {
    expect(cleanBrandName("  amul   dairy ")).toBe("Amul Dairy");
    expect(cleanBrandName("iPhone")).toBe("iPhone"); // keeps the seller's own capitals
    expect(brandKey("  AMUL  ")).toBe("amul");
    expect(cleanBrandName("   ")).toBe("");
  });

  it("spots typos and near-duplicates", () => {
    expect(similarBrands("Amull", list).map((b) => b.name)).toContain("Amul");
    expect(similarBrands("Ashirvaad", list).map((b) => b.name)).toContain("Aashirvaad");
    expect(similarBrands("Tata", list).map((b) => b.name)).toContain("Tata Sampann");
    expect(similarBrands("Fortune Foods", list).map((b) => b.name)).toContain("Fortune");
  });

  it("does not flag genuinely different brands", () => {
    expect(similarBrands("Britannia", list)).toEqual([]);
    expect(similarBrands("Nestle", list)).toEqual([]);
  });
});
