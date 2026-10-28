import { useEffect, useLayoutEffect, useState } from "react";

// Below this the screen is too short to give the two panes their own scroll
// (e.g. a phone held sideways), so the page just scrolls normally instead.
const MIN_FIXED_HEIGHT = 440;

/**
 * Makes `ref` fill the rest of the screen from where it starts, so the
 * billing panes can scroll inside it and the totals and Pay button stay in
 * view. Returns { height, shiftTop } (px), or null when there is not enough
 * room (the page then scrolls normally).
 *
 * It measures the real top of the element, so it is right whichever panel it
 * is in (seller, admin or the POS-only staff screen); it leaves room for the
 * phone bottom bar, and pushes the content down if a fixed header would
 * otherwise cover its first row.
 *
 * While it fills the screen the page itself does not scroll.
 */
export function useFillViewport(ref) {
  const [fill, setFill] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bottomBar = document.querySelector("[data-bottom-nav]");
      const reserved = bottomBar && bottomBar.offsetHeight > 0 ? bottomBar.offsetHeight : 0;
      const header = document.querySelector("header");
      const headerBottom = header && getComputedStyle(header).position === "fixed" ? header.getBoundingClientRect().bottom : 0;
      const height = Math.floor(window.innerHeight - top - reserved);
      setFill(height >= MIN_FIXED_HEIGHT ? { height, shiftTop: Math.max(0, Math.ceil(headerBottom - top)) } : null);
    };

    measure();
    const frame = requestAnimationFrame(measure); // once more after the layout settles
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [ref]);

  const fixed = fill !== null;
  useEffect(() => {
    if (!fixed) return undefined;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    // overflow:hidden stops the user scrolling, but focusing an input can still
    // nudge the page; put it straight back so nothing slides under the header.
    const putBack = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    putBack();
    window.addEventListener("scroll", putBack, { passive: true });
    return () => {
      window.removeEventListener("scroll", putBack);
      html.style.overflow = previous;
    };
  }, [fixed]);

  return fill;
}
