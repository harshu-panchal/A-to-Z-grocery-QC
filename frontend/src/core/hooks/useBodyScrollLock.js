import { useEffect } from "react";

/**
 * Freeze the page behind a modal while `locked` is true.
 *
 * - Pins <body> with position: fixed at the current offset. Plain
 *   `overflow: hidden` is ignored by iOS Safari / WKWebView, so the page
 *   still scrolled there.
 * - Stops Lenis (desktop smooth scroll, see shared/components/LenisScroll),
 *   which otherwise keeps scrolling the window on mouse wheel.
 *
 * Give the modal's own scroll area `data-lenis-prevent` so it can still
 * scroll on desktop, and `overscroll-contain` so it doesn't chain on touch.
 */
export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    const { body, documentElement: html } = document;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
    };

    const lenis = window.__lenis;
    lenis?.stop();

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
      if (lenis) {
        lenis.scrollTo(scrollY, { immediate: true, force: true });
        lenis.start();
      }
    };
  }, [locked]);
}
