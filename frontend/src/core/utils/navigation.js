/**
 * Go back one page inside the app, or to `fallback` when there is no earlier
 * in-app page (opened from a link / refreshed tab), so "back" never leaves
 * the app or bounces between two pages.
 *
 * React Router keeps its own index in history.state.idx (0 = first page).
 */
export function goBack(navigate, fallback = "/") {
  const idx = typeof window !== "undefined" ? window.history.state?.idx : undefined;
  if (typeof idx === "number" && idx > 0) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
