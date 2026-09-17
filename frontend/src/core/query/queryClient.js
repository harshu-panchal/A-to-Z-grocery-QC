import { QueryClient } from '@tanstack/react-query';

// Perf audit FE-R5 / Phase 8: the app previously had almost no shared
// fetch cache — `core/api/dedupe.js` was used in only 4 files out of 389+
// direct API call sites, so navigating back to a page you'd just visited
// always re-fetched everything from a blank loading state. This is the
// single shared cache all migrated pages read from and write to.
//
// Defaults are deliberately conservative, not "cache forever":
// - staleTime: 15s — short enough that admin/seller/delivery data (orders,
//   stock, earnings) never looks meaningfully out of date, long enough
//   that navigating between two pages you already fetched within the last
//   15s shows data instantly instead of a loading skeleton.
// - refetchOnWindowFocus: true (the library default) — an intentional
//   improvement: switching back to a backgrounded tab now silently
//   refreshes stale data instead of showing whatever was last fetched.
// - retry: 1 — the existing axios client/interceptors already handle auth
//   redirects and most error surfacing; one retry covers transient network
//   blips without masking a real failure behind repeated silent retries.
// Any page that specifically needs "always fetch fresh, never cache" (e.g.
// a page showing a live balance right before a financial action) can still
// override staleTime to 0 on that one query.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
