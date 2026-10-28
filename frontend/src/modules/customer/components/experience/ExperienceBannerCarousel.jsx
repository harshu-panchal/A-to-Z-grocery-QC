import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  applyCloudinaryTransform,
  buildCloudinarySrcSet,
  isCloudinaryUrl,
} from "@/core/utils/imageUtils";
import { bannerTarget, useBannerLink } from "../../hooks/useBannerLink";
import { activeIndex, buildStrip, clampPos, settledPos } from "./bannerCarouselMath";

const AUTOPLAY_MS = 4500;
// 1 slides the banners from right to left (the next banner enters from the
// right edge, like a swipe). Use -1 for left to right.
const AUTOPLAY_STEP = 1;
const SLIDE_TRANSITION = { type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.55 };
const SNAP_TRANSITION = { duration: 0 };
// A lone banner on a wide screen stops at this width instead of stretching.
const SINGLE_BANNER_MAX_PX = 720;
// Each banner keeps its own image proportions (nothing is cropped). Until an
// image has loaded it holds this shape. Shapes beyond the limits (a square
// poster, a thin strip) are shown whole with bars at the sides or top, so one
// odd image can't make the whole row tall or flat.
const DEFAULT_RATIO = 824 / 397;
const MIN_RATIO = 1.5;
const MAX_RATIO = 3;
const clampRatio = (r) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// How many banners sit side by side: "row" shows 1 / 2 / 3 on phone / tablet /
// desktop; "full" and "bare" always show one.
const readPerView = (variant) => {
  if (variant !== "row" || typeof window === "undefined") return 1;
  const w = window.innerWidth;
  if (w >= 1024) return 3;
  return w >= 768 ? 2 : 1;
};

const usePerView = (variant) => {
  const [perView, setPerView] = React.useState(() => readPerView(variant));
  React.useEffect(() => {
    const onResize = () => setPerView(readPerView(variant));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [variant]);
  return perView;
};

/**
 * Looping banner carousel.
 *  - default ("row"): 1 / 2 / 3 banners per view with a gap, rounded corners,
 *    dots underneath. Used for Create Sections banners and the website hero.
 *  - `fullWidth`: one edge-to-edge banner (tablet hero).
 *  - `bare`: one banner filling its parent, which supplies the frame (phone hero).
 * It slides by itself, pauses on touch / hover / focus / background tab, and
 * also supports swiping, dots and keyboard.
 */
const ExperienceBannerCarousel = ({ section, items, fullWidth = false, bare = false }) => {
  const variant = fullWidth ? "full" : bare ? "bare" : "row";
  const openBanner = useBannerLink();
  const perView = usePerView(variant);
  const gap = variant === "row" ? (perView > 1 ? 16 : 12) : 0;

  // Images that failed to load are dropped instead of leaving a blank slide.
  const [failed, setFailed] = React.useState(() => new Set());
  // width / height of each loaded image, keyed by its url
  const [ratios, setRatios] = React.useState({});
  const rememberRatio = React.useCallback((url, img) => {
    const { naturalWidth: w, naturalHeight: h } = img || {};
    if (!w || !h) return;
    const ratio = w / h;
    setRatios((prev) => (Math.abs((prev[url] || 0) - ratio) < 0.001 ? prev : { ...prev, [url]: ratio }));
  }, []);
  const banners = React.useMemo(
    () => (items || []).filter((b) => b?.imageUrl && !failed.has(b.imageUrl)),
    [items, failed],
  );
  const total = banners.length;
  const looping = total > perView;

  const [pos, setPos] = React.useState(perView);
  const [snapping, setSnapping] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const viewportRef = React.useRef(null);
  // A swipe ends with a click event too; only a tap should open the link.
  const draggedRef = React.useRef(false);

  // Banners shown = [last N clones][real banners][first N clones], so the
  // strip can keep sliding in either direction without rewinding.
  const strip = React.useMemo(() => buildStrip(banners, perView), [banners, perView]);

  React.useEffect(() => {
    setSnapping(true);
    setPos(perView);
  }, [perView, total]);

  React.useEffect(() => {
    if (!snapping) return undefined;
    const id = requestAnimationFrame(() => setSnapping(false));
    return () => cancelAnimationFrame(id);
  }, [snapping]);

  const hasBanners = total > 0;
  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasBanners]);

  const move = React.useCallback(
    (direction) => setPos((prev) => clampPos(prev + direction, total, perView)),
    [total, perView],
  );

  React.useEffect(() => {
    if (!looping || paused || prefersReducedMotion()) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) move(AUTOPLAY_STEP);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [looping, paused, move]);

  // After sliding onto a cloned banner, jump (unseen) to the identical real one.
  const settle = () => {
    const target = settledPos(pos, total, perView);
    if (target === null) return;
    setSnapping(true);
    setPos(target);
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.x < -50) move(1);
    else if (info.offset.x > 50) move(-1);
  };

  const optimizedSrc = React.useCallback(
    (url) => (isCloudinaryUrl(url) ? applyCloudinaryTransform(url, "f_auto,q_auto,c_scale,w_824") : url),
    [],
  );

  if (!hasBanners) return null;

  const slideWidth = width ? (width - (perView - 1) * gap) / perView : 0;
  const step = slideWidth + gap;
  const currentX = -pos * step;
  const activeDot = looping ? activeIndex(pos, total, perView) : 0;
  const perViewWidth = `calc((100% - ${(perView - 1) * gap}px) / ${perView})`;
  const staticWidth = variant === "row" && total === 1 ? `min(100%, ${SINGLE_BANNER_MAX_PX}px)` : perViewWidth;
  const dotsBelow = variant === "row";

  const renderSlide = (banner, i) => {
    const realIndex = looping ? i - perView : i;
    const isClone = looping && (realIndex < 0 || realIndex >= total);
    const linked = Boolean(bannerTarget(banner));
    const open = () => { if (!draggedRef.current) openBanner(banner); };
    return (
      <div
        key={`${i}-${banner.imageUrl}`}
        role={linked ? "link" : "group"}
        aria-roledescription="slide"
        aria-label={isClone ? undefined : `${realIndex + 1} of ${total}`}
        aria-hidden={isClone || undefined}
        tabIndex={linked && !isClone ? 0 : undefined}
        onClick={linked ? open : undefined}
        onKeyDown={
          linked
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBanner(banner); }
              }
            : undefined
        }
        className={cn(
          "relative shrink-0 overflow-hidden bg-slate-100",
          variant === "row" && "rounded-2xl shadow-sm",
          linked && "cursor-pointer",
        )}
        style={{
          width: looping ? perViewWidth : staticWidth,
          aspectRatio: clampRatio(ratios[banner.imageUrl] || DEFAULT_RATIO),
        }}
      >
        <img
          src={optimizedSrc(banner.imageUrl)}
          srcSet={
            isCloudinaryUrl(banner.imageUrl)
              ? buildCloudinarySrcSet(banner.imageUrl, [{ w: 412 }, { w: 824 }, { w: 1248 }], "f_auto,q_auto,c_scale")
              : undefined
          }
          sizes={variant === "row" ? "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" : "100vw"}
          alt={banner.title || section?.title || "Banner"}
          className="h-full w-full object-contain object-center pointer-events-none"
          ref={(el) => { if (el?.complete) rememberRatio(banner.imageUrl, el); }}
          onLoad={(e) => rememberRatio(banner.imageUrl, e.currentTarget)}
          loading={realIndex >= 0 && realIndex < perView ? "eager" : "lazy"}
          fetchPriority={realIndex === 0 ? "high" : "low"}
          decoding="async"
          draggable={false}
          onError={() => setFailed((prev) => new Set(prev).add(banner.imageUrl))}
        />
        {(banner.title || banner.subtitle) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-3 pb-3 pt-8 text-white md:px-4">
            {banner.title && <p className="line-clamp-2 text-sm font-extrabold leading-tight md:text-base">{banner.title}</p>}
            {banner.subtitle && (
              <p className="mt-0.5 line-clamp-2 text-[11px] font-medium opacity-90 md:text-xs">{banner.subtitle}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const dots =
    looping && (
      <div
        className={cn(
          "flex justify-center gap-1.5",
          dotsBelow ? "mt-3" : "pointer-events-none absolute inset-x-0 bottom-2",
        )}
      >
        {banners.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show banner ${i + 1}`}
            aria-current={i === activeDot}
            onClick={() => { setSnapping(false); setPos(perView + i); }}
            className={cn(
              "pointer-events-auto h-1.5 rounded-full transition-all",
              dotsBelow
                ? i === activeDot ? "w-5 bg-primary" : "w-1.5 bg-slate-300 hover:bg-slate-400"
                : cn("shadow-[0_0_4px_rgba(0,0,0,0.35)]", i === activeDot ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80"),
            )}
          />
        ))}
      </div>
    );

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={section?.title || "Banners"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div
        ref={viewportRef}
        className={cn(
          "overflow-hidden touch-pan-y",
          fullWidth && "relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]",
        )}
      >
        {looping ? (
          <motion.div
            // New layout (first measure, window resize) => new strip that starts
            // in the right place instead of sliding there.
            key={`${perView}-${Math.round(width)}`}
            drag="x"
            dragConstraints={{ left: currentX, right: currentX }}
            dragElastic={0.2}
            onPointerDown={() => { draggedRef.current = false; }}
            onDragStart={() => { draggedRef.current = true; }}
            onDragEnd={handleDragEnd}
            initial={false}
            animate={{ x: currentX }}
            transition={snapping ? SNAP_TRANSITION : SLIDE_TRANSITION}
            onAnimationComplete={settle}
            className="flex items-center"
            style={{ gap }}
          >
            {strip.map(renderSlide)}
          </motion.div>
        ) : (
          <div className="flex items-center justify-center" style={{ gap }}>
            {strip.map(renderSlide)}
          </div>
        )}
      </div>
      {dots}
    </div>
  );
};

export default ExperienceBannerCarousel;
