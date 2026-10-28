// Position maths for the looping banner carousel.
//
// The strip is [last N clones][real banners][first N clones] where N is the
// number of banners visible at once (perView). `pos` is the index of the first
// visible slide in that strip, so the real banners start at pos = perView.

export const buildStrip = (banners, perView) =>
  banners.length > perView
    ? [...banners.slice(-perView), ...banners, ...banners.slice(0, perView)]
    : banners;

/** Keep pos inside the strip (a window of perView slides must fit). */
export const clampPos = (pos, total, perView) => Math.min(Math.max(pos, 0), total + perView);

/**
 * After sliding onto cloned slides, the equivalent real position to jump to
 * without animation, or null when pos is already on real slides.
 */
export const settledPos = (pos, total, perView) => {
  if (pos < perView) return pos + total;
  if (pos >= perView + total) return pos - total;
  return null;
};

/** Which banner (0-based) is first in view, for the dots. */
export const activeIndex = (pos, total, perView) => (((pos - perView) % total) + total) % total;
