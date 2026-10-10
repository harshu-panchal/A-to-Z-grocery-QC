import { jest } from "@jest/globals";

const seller = {
  location: { coordinates: [-73.9857, 40.7484] },
  serviceRadius: 1,
};
const riderId = "rider-1";
const riders = [
  {
    _id: { toString: () => riderId },
    location: { coordinates: [-73.9857, 40.7750] },
  },
];
const deliveryFind = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findById: () => ({
      select: () => ({ lean: async () => seller }),
    }),
  },
}));
jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: { find: deliveryFind },
}));

const { getDeliveryPartnerIdsWithinSellerRadius } = await import(
  "../app/services/deliveryNearbyService.js"
);

describe("getDeliveryPartnerIdsWithinSellerRadius", () => {
  beforeEach(() => {
    deliveryFind.mockReset();
    deliveryFind.mockReturnValue({
      select: () => ({ lean: async () => riders }),
    });
  });

  it("uses the active delivery radius instead of the seller customer radius", async () => {
    const ids = await getDeliveryPartnerIdsWithinSellerRadius("seller-1", 5000);

    expect(ids).toEqual([riderId]);
    expect(deliveryFind).toHaveBeenCalledTimes(1);
    expect(deliveryFind.mock.calls[0][0].location.$near.$maxDistance).toBe(5000);
  });
});
