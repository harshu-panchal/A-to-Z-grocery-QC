import { jest } from "@jest/globals";

// Campaign price engine + rules. Models are mocked so no DB is needed.
const campaignFind = jest.fn();
const campaignFindOne = jest.fn();
const participationFind = jest.fn();
const productFind = jest.fn();

const chain = (value) => {
  const q = { select: () => q, sort: () => q, limit: () => q, lean: () => Promise.resolve(value) };
  return q;
};

jest.unstable_mockModule("../app/models/discountCampaign.js", () => ({
  default: { find: campaignFind, findOne: campaignFindOne },
}));
jest.unstable_mockModule("../app/models/campaignParticipation.js", () => ({
  default: { find: participationFind },
}));
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { find: productFind },
}));

const pricing = await import("../app/services/campaign/campaignPricing.js");
const { campaignPhase, canSellerRespond, normalizeCampaignInput, eligibleProductFilter } = await import(
  "../app/services/campaign/campaignService.js"
);

const pct20 = { discountType: "percentage", discountValue: 20 };

describe("campaign price math", () => {
  test("percentage, cap and flat", () => {
    expect(pricing.salePriceFor(100, pct20)).toBe(80);
    expect(pricing.salePriceFor(1000, { ...pct20, maxDiscount: 50 })).toBe(950);
    expect(pricing.salePriceFor(100, { discountType: "flat", discountValue: 15 })).toBe(85);
  });

  test("never more than the platform max (50%)", () => {
    expect(pricing.salePriceFor(100, { discountType: "flat", discountValue: 90 })).toBe(50);
  });

  test("never below purchase cost", () => {
    expect(pricing.salePriceFor(100, pct20, 90)).toBe(90);
    expect(pricing.isBelowCost(100, pct20, 90)).toBe(true);
    expect(pricing.isBelowCost(100, pct20, 70)).toBe(false);
    // cost at/above the price -> no discount at all
    expect(pricing.salePriceFor(100, pct20, 100)).toBeNull();
  });

  test("base price follows checkout: sellingPrice, else mrp", () => {
    expect(pricing.basePriceOf({ mrp: 120, sellingPrice: 100 })).toBe(100);
    expect(pricing.basePriceOf({ mrp: 120, sellingPrice: 0 })).toBe(120);
  });
});

describe("applyCampaignToProduct", () => {
  const entry = {
    campaign: { _id: "c1", name: "Diwali", endAt: new Date("2030-01-01"), ...pct20 },
    cost: 0,
    variantCost: new Map([["SKU-2", 0]]),
  };
  const index = new Map([["p1", entry]]);

  test("discounts product and variants, keeps mrp for strike-through", () => {
    const out = pricing.applyCampaignToProduct(
      { _id: "p1", mrp: 120, sellingPrice: 100, variants: [{ sku: "SKU-2", mrp: 60, sellingPrice: 50 }] },
      index,
    );
    expect(out.sellingPrice).toBe(80);
    expect(out.mrp).toBe(120);
    expect(out.variants[0].sellingPrice).toBe(40);
    expect(out.campaign).toMatchObject({ _id: "c1", label: "20% off", regularPrice: 100 });
  });

  test("leaves other products untouched", () => {
    const p = { _id: "p2", mrp: 50, sellingPrice: 50 };
    expect(pricing.applyCampaignToProduct(p, index)).toBe(p);
  });

  test("checkout line price records the discount", () => {
    expect(pricing.campaignLinePrice(index, "p1", null, 100)).toEqual({
      price: 80,
      campaignId: "c1",
      campaignDiscount: 20,
    });
    expect(pricing.campaignLinePrice(index, "nope", null, 100)).toBeNull();
  });
});

describe("live index only uses joined products of the seller who owns them", () => {
  test("builds from live campaigns and drops other sellers' products", async () => {
    const now = new Date("2030-01-01T10:00:00Z");
    campaignFind.mockReturnValue(
      chain([{ _id: "c1", name: "Sale", ...pct20, endAt: new Date("2030-01-02"), excludedProductIds: ["p3"] }]),
    );
    campaignFindOne.mockReturnValue(chain(null));
    participationFind.mockReturnValue(
      chain([{ campaignId: "c1", sellerId: "s1", productIds: ["p1", "p2", "p3"] }]),
    );
    productFind.mockReturnValue(
      chain([
        { _id: "p1", sellerId: "s1", purchaseRate: 10, variants: [] },
        { _id: "p2", sellerId: "OTHER", purchaseRate: 0, variants: [] },
        { _id: "p3", sellerId: "s1", purchaseRate: 0, variants: [] },
      ]),
    );
    const { byProduct } = await pricing.buildCampaignPriceIndex(now);
    expect([...byProduct.keys()]).toEqual(["p1"]);
    expect(byProduct.get("p1").cost).toBe(10);
  });
});

describe("campaign phases and rules", () => {
  const base = {
    status: "published",
    joinDeadline: new Date("2030-01-05"),
    startAt: new Date("2030-01-06"),
    endAt: new Date("2030-01-10"),
  };

  test("phase follows the clock", () => {
    expect(campaignPhase(base, new Date("2030-01-01"))).toBe("inviting");
    expect(campaignPhase(base, new Date("2030-01-07"))).toBe("live");
    expect(campaignPhase(base, new Date("2030-01-11"))).toBe("ended");
    expect(campaignPhase({ ...base, status: "paused" }, new Date("2030-01-07"))).toBe("paused");
  });

  test("sellers locked in once the deadline passes or the sale starts", () => {
    expect(canSellerRespond(base, new Date("2030-01-04"))).toBe(true);
    expect(canSellerRespond(base, new Date("2030-01-05T12:00:00Z"))).toBe(false);
    expect(canSellerRespond(base, new Date("2030-01-07"))).toBe(false);
  });

  test("input validation", () => {
    const ok = {
      name: "Sale",
      targetType: "categories",
      categoryIds: ["507f1f77bcf86cd799439011"],
      discountType: "percentage",
      discountValue: 20,
      joinDeadline: "2030-01-05",
      startAt: "2030-01-06",
      endAt: "2030-01-10",
    };
    expect(normalizeCampaignInput(ok).data).toBeTruthy();
    expect(normalizeCampaignInput({ ...ok, discountValue: 60 }).error).toMatch(/50%/);
    expect(normalizeCampaignInput({ ...ok, endAt: "2030-01-01" }).error).toMatch(/End date/);
    expect(normalizeCampaignInput({ ...ok, joinDeadline: "2030-01-08" }).error).toMatch(/Join deadline/);
    expect(normalizeCampaignInput({ ...ok, categoryIds: [] }).error).toMatch(/category/);
  });

  test("eligibility filter works with populated categories (detail screen)", () => {
    const id = "507f1f77bcf86cd799439011";
    const f = eligibleProductFilter({ targetType: "categories", categoryIds: [{ _id: id, name: "Fruits" }] });
    expect(JSON.stringify(f)).toContain(id);
    expect(JSON.stringify(f)).not.toContain("[object Object]");
  });
});
