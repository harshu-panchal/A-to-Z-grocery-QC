import { describe, expect, it } from "@jest/globals";
import { activeIndex, buildStrip, clampPos, settledPos } from "../modules/customer/components/experience/bannerCarouselMath";

const banners = ["a", "b", "c", "d", "e"];

describe("buildStrip", () => {
  it("adds clones of the last and first banners on each side", () => {
    expect(buildStrip(banners, 3)).toEqual(["c", "d", "e", "a", "b", "c", "d", "e", "a", "b", "c"]);
    expect(buildStrip(banners, 1)).toEqual(["e", "a", "b", "c", "d", "e", "a"]);
  });

  it("does not loop when everything already fits", () => {
    expect(buildStrip(["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
    expect(buildStrip(["a"], 1)).toEqual(["a"]);
  });
});

describe("sliding left to right (position decreases)", () => {
  const total = 5;
  const perView = 3;

  it("walks through every banner and wraps around forever", () => {
    let pos = perView;
    const shown = [];
    for (let i = 0; i < 12; i += 1) {
      shown.push(activeIndex(pos, total, perView));
      pos = clampPos(pos - 1, total, perView);
      const target = settledPos(pos, total, perView);
      if (target !== null) pos = target;
      expect(pos).toBeGreaterThanOrEqual(perView);
      expect(pos).toBeLessThan(perView + total);
    }
    expect(shown).toEqual([0, 4, 3, 2, 1, 0, 4, 3, 2, 1, 0, 4]);
  });

  it("lands on a clone first, then jumps to the identical real slide", () => {
    const strip = buildStrip(banners, perView);
    const onClone = perView - 1; // one step left of the first real banner
    const real = settledPos(onClone, total, perView);
    expect(real).toBe(perView + total - 1);
    // Same slides visible before and after the unseen jump.
    expect(strip.slice(onClone, onClone + perView)).toEqual(strip.slice(real, real + perView));
  });
});

describe("sliding right to left (position increases)", () => {
  it("wraps from the last banner to the first without a visible jump", () => {
    const total = 5;
    const perView = 3;
    const strip = buildStrip(banners, perView);
    const past = perView + total; // first position made only of end clones
    const real = settledPos(past, total, perView);
    expect(real).toBe(perView);
    expect(strip.slice(past, past + perView)).toEqual(strip.slice(real, real + perView));
  });
});

describe("clampPos / settledPos", () => {
  it("never leaves the strip when taps arrive faster than the animation", () => {
    expect(clampPos(-4, 5, 3)).toBe(0);
    expect(clampPos(99, 5, 3)).toBe(8);
    expect(settledPos(4, 5, 3)).toBeNull();
    expect(settledPos(0, 5, 1)).toBe(5);
  });

  it("reports the first visible banner for the dots", () => {
    expect(activeIndex(3, 5, 3)).toBe(0);
    expect(activeIndex(7, 5, 3)).toBe(4);
    expect(activeIndex(2, 5, 3)).toBe(4); // on a clone, still shows banner 5
  });
});
