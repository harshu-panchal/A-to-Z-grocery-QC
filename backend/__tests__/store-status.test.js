process.env.REDIS_DISABLED = "true";

const { computeStoreStatus, formatTime } = await import("../app/services/seller/storeStatus.js");

// India time helper: "2026-10-31T21:45" IST -> Date
const ist = (s) => new Date(`${s}:00+05:30`);
const shop = (extra = {}) => ({
  storeOpen: true,
  businessHours: { open: "10:00", close: "22:30" },
  workingDays: [1, 2, 3, 4, 5, 6], // Sunday off
  ...extra,
});

describe("store status (seller's switch decides, hours are shown)", () => {
  it("formats times for customers", () => {
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("22:30")).toBe("10:30 PM");
    expect(formatTime("00:00")).toBe("12:00 AM");
  });

  it("open shop: no message far from closing time", () => {
    expect(computeStoreStatus(shop(), ist("2026-10-31T15:00"))).toEqual({ isOpen: true, closingSoon: "" }); // Saturday
  });

  it("open shop: 'Accepting orders until' in the last hour", () => {
    expect(computeStoreStatus(shop(), ist("2026-10-31T21:45")).closingSoon).toBe("Accepting orders until 10:30 PM");
  });

  it("hours alone never close the shop (switch on = open, even at night)", () => {
    expect(computeStoreStatus(shop(), ist("2026-10-31T23:30")).isOpen).toBe(true);
  });

  it("switched off: closed, with the next opening", () => {
    expect(computeStoreStatus(shop({ storeOpen: false }), ist("2026-10-30T08:00"))).toMatchObject({ isOpen: false, message: "Opens 10:00 AM" }); // Fri morning
    expect(computeStoreStatus(shop({ storeOpen: false }), ist("2026-10-30T23:00")).message).toBe("Opens tomorrow 10:00 AM"); // Fri night -> Sat
    expect(computeStoreStatus(shop({ storeOpen: false }), ist("2026-10-31T23:00")).message).toBe("Opens Mon 10:00 AM"); // Sat night, Sun off
  });

  it("vacation closes the shop for the chosen dates only", () => {
    const v = shop({ vacation: { enabled: true, from: ist("2026-11-01T00:00"), to: ist("2026-11-04T00:00"), message: "Diwali break" } });
    expect(computeStoreStatus(v, ist("2026-10-31T12:00")).isOpen).toBe(true);
    expect(computeStoreStatus(v, ist("2026-11-02T12:00"))).toMatchObject({ isOpen: false, reason: "vacation", message: "Diwali break" });
    expect(computeStoreStatus(v, ist("2026-11-04T20:00")).isOpen).toBe(false); // last day included
    expect(computeStoreStatus(v, ist("2026-11-05T09:00")).isOpen).toBe(true);
  });

  it("overnight hours (6 PM - 2 AM) give the right closing time", () => {
    const night = shop({ businessHours: { open: "18:00", close: "02:00" }, workingDays: [0, 1, 2, 3, 4, 5, 6] });
    expect(computeStoreStatus(night, ist("2026-10-31T01:15")).closingSoon).toBe("Accepting orders until 2:00 AM");
    expect(computeStoreStatus(night, ist("2026-10-31T20:00")).closingSoon).toBe("");
  });
});
