# Appzeto Quick-Commerce — Performance Audit
## Part 2 of 2: Phased Implementation Roadmap

> Every phase is **independently shippable** and **independently verifiable**. Every phase preserves exact API contracts, response shapes, routes, and UI behavior — nothing here removes or changes a feature. Where a ticket has any risk of a visible side effect, it says so explicitly under **"Behavior check."**
>
> **Effort** assumes one engineer familiar with this codebase. **Nothing in this plan has been implemented yet** — this is the roadmap only.

---

# PHASE 0 — Baseline Measurement (read-only, no code changes)

**Objective:** capture real numbers before changing anything, so every later phase can be verified as an actual improvement instead of "it feels faster."
**Effort:** 0.5 day. **Risk:** None.

| # | Action | How |
|---|---|---|
| 1 | Record current bundle chunk sizes | `cd frontend && npm run build`, save `dist/assets/*.js` byte sizes (Part 1 already captured a snapshot: entry 1,596KB, vendor-motion 139KB, vendor-mui 83KB, vendor-charts 407KB — use as baseline) |
| 2 | Record current p50/p95 response time for the 6 flagged hot endpoints | `GET /seller/nearby`, `GET /offers`, admin `GET /users` (customer list), seller `GET .../earnings`, delivery available-orders feed, product list/search — sample via existing `metricsMiddleware.js`/`/metrics` route or a quick load test against staging |
| 3 | Record real device timing on a mid-range Android phone (the actual target device class) | Open each portal's home screen + one list-heavy page (Chrome DevTools remote debugging or a physical device), note Time-to-Interactive and scroll-jank (frame drops) qualitatively |
| 4 | Snapshot current `databaseIndexManager.verifyIndexes()` output | Run it against a copy/staging DB, save the report |

**Deliverable:** a short `performance_baseline.md` with these numbers, committed alongside this plan. Every later phase's acceptance criteria references this baseline.

---

# PHASE 1 — Cache Two Hot, Uncached Read Endpoints

**Objective:** fix BE-I2, BE-I3. Zero risk — this codebase already has a proven `getOrSet`/`invalidate` cache pattern used correctly on sibling endpoints (category tree, settings, hero config); these two tickets copy that exact pattern.
**Effort:** 0.5 day. **Risk:** Low.

### P1-1: Cache `GET /seller/nearby`
**File:** `backend/app/controller/sellerController.js` (`getNearbySellers`).
**Change:** wrap the existing `$near` query + JS distance-filter in `cacheService.getOrSet(cacheKey, fetchFn, getTTL('nearbySellers'))`, using the already-defined 300s TTL (`cacheService.js:27`). Cache key must include the rounded lat/lng (e.g. to ~1km grid) so nearby-but-distinct locations share a cache entry without serving wrong results to a genuinely different area — **do not** key on raw unrounded coordinates (defeats caching) or omit location from the key (would serve wrong sellers to different areas).
**Invalidation:** none needed if TTL-only (seller location/radius changes rarely and 300s staleness is already the product's accepted tolerance per the existing TTL definition) — confirm this assumption is acceptable, or add invalidation on seller profile/location update mirroring the pattern used for category cache invalidation on category write.
**Behavior check:** response shape, filtering logic, and field list are unchanged — this only wraps the existing fetch in a cache, it does not alter what's computed.
**Acceptance:** identical response for the same request repeated within TTL; response updates within TTL + 1 request after a seller's location changes; p95 latency for this endpoint drops materially per Phase 0 baseline.

### P1-2: Cache `GET /offers`
**File:** `backend/app/controller/offerController.js` (`getPublicOffers`).
**Change:** same `getOrSet` pattern as category/settings caching, with invalidation triggered on offer create/update/delete (mirror however the category-cache invalidation is wired to category writes).
**Behavior check:** identical to P1-1 — additive caching only.
**Acceptance:** same as P1-1.

---

# PHASE 2 — Fix Dead/Misnamed DB Indexes

**Objective:** fix BE-D1, BE-D8. Index-only changes — never alter what a query returns, only how fast it's found.
**Effort:** 0.5 day. **Risk:** Low (background index builds don't lock MongoDB 4.2+, but schedule during low-traffic hours as standard practice).

### P2-1: Fix the phantom `customers` → `users` collection name in the index manager
**File:** `backend/app/services/databaseIndexManager.js:89-93`.
**Change:** rename the `customers:` key to `users:` so `{phone:1}`, `{email:1}`, `{createdAt:-1}` are actually created against the real, hot collection. Before merging, run `verifyIndexes()` against staging to confirm the old phantom-collection indexes (harmless, on an empty collection) can be dropped and the new ones build cleanly on the real `users` collection size.
**Behavior check:** none — index-only.
**Acceptance:** `users` collection has all 3 indexes present in staging; admin customer-list sort-by-`createdAt` query plan shows an index scan, not a collection scan (`explain()`).

### P2-2: Remove/fix the 3 dead-field index definitions
**Files:** `databaseIndexManager.js:100-103` (wishlists — fix `items.productId` → `products`, or drop if the schema's own `unique:true` already covers the real query pattern), `:95-98` (deliveries — drop the non-existent `isActive` key, keep the real 2-key index that already exists at schema level so nothing duplicates), `:124` (ledgerentries — drop this manager-level duplicate of the schema-level index entirely).
**Behavior check:** none — removes only dead/duplicate index definitions, changes no query results.
**Acceptance:** `verifyIndexes()` report shows no phantom/duplicate entries; write throughput on `deliveries` (location-ping-heavy) and `ledgerentries` (finance-write-heavy) measurably improves per Phase 0 baseline.

---

# PHASE 3 — Lazy-Load the 5 Non-Split Entry Pages + Defer Heavy Libraries

**Objective:** fix FE-B1, FE-B2, FE-B5, FE-B6. This is the single highest-leverage frontend fix — mechanically identical to a pattern already used correctly elsewhere in the same file for `SellerModule`/`AdminModule`/`DeliveryModule`.
**Effort:** 1 day. **Risk:** Low, but requires a full click-through smoke test of all 5 auth flows post-change (see Behavior check).

### P3-1: `lazy()`-wrap the 5 auth/entry screens
**File:** `frontend/src/core/routes/AppRouter.jsx:19-23` (and the `CustomerLayoutWrapper`/`CustomerLayout` import at `:63` for FE-B4).
**Change:** convert the 5 static imports to `React.lazy(() => import(...))`, wrap their route elements in the same `<Suspense fallback={...}>` boundary already used for the lazy module routes a few lines below.
**Behavior check:** the rendered auth screens must be pixel-identical; the only observable difference should be a brief (one-time, per portal, per session) loading-fallback flash on first navigation to that route — confirm the existing fallback UI (spinner/skeleton) used by the already-lazy modules is applied consistently here too, so the flash looks intentional, not broken.
**Acceptance:** `npm run build` chunk report shows tesseract.js, the 3 Lottie JSONs, and the Google Maps loader (FE-B2, B5, B6) no longer present in the entry chunk; manually walk all 5 auth flows (customer/seller/delivery/admin login+signup, including the delivery OCR step and seller map picker) end-to-end and confirm identical behavior to pre-change.

### P3-2: Dynamic-import `tesseract.js` at the point of use
**File:** `frontend/src/modules/delivery/pages/DeliveryAuth.jsx:27,113`.
**Change:** replace the top-level `import Tesseract from "tesseract.js"` with `const Tesseract = await import("tesseract.js")` inside the OCR handler function, matching the dynamic-import pattern already used correctly for the Lottie JSON in `MainLocationHeader.jsx:159`.
**Behavior check:** OCR feature must produce identical output; only change is a brief one-time load delay the first time a delivery signup reaches the OCR step (acceptable and expected — it's replacing "always paid by everyone" with "paid once by the person who actually uses it").
**Acceptance:** delivery signup OCR step still recognizes ID documents correctly; tesseract.js confirmed absent from entry chunk (already covered by P3-1's build check if bundled together, or independently if P3-2 ships alone).

### P3-3: Dynamic-import the 3 Lottie JSON files
**Files:** `Auth.jsx:30`, `DeliveryAuth.jsx:22`, `AdminAuth.jsx:18`.
**Change:** `import(...)` instead of static import, same pattern as P3-2.
**Behavior check:** animation must render identically once loaded; acceptable one-time load delay on first view of that specific auth page only.
**Acceptance:** visual diff of each auth page before/after shows no change once loaded; entry chunk no longer contains the ~302KB of inlined JSON.

---

# PHASE 4 — Fix `manualChunks` Vendor Cross-Contamination

**Objective:** fix FE-B3. Higher care needed than Phase 3 because a wrong chunk-splitting change can produce circular-chunk runtime errors ("cannot access X before initialization").
**Effort:** 0.5-1 day (mostly testing time). **Risk:** Low-Medium.

### P4-1: Add an explicit `vendor-react`/shared-runtime chunk rule that's evaluated before the library-specific buckets
**File:** `frontend/vite.config.js:44-58`.
**Change:** in the `manualChunks` function, check for `react`/`react-dom`/`clsx`/other cross-cutting shared utilities **first**, routing them to a dedicated shared chunk, before falling through to the MUI/motion/firebase/charts checks — so a shared utility can never be "claimed" by a feature-specific vendor bucket again.
**Behavior check:** this changes *only* which JS file a module physically lives in, never what the module does. The real risk is a broken import order producing a runtime error, not a behavior change — so the acceptance bar is "the app boots and every portal's critical path works," not "output is identical" (chunk boundaries will visibly change in the build report, that's the point).
**Acceptance:** `npm run build` succeeds with no warnings about chunk circular deps; `vendor-mui`/`vendor-charts` no longer appear in `dist/index.html`'s `modulepreload` list (proving they're no longer eager); full smoke test of all 4 portals' critical paths (login, browse/list, one write action e.g. add-to-cart or accept-order, logout) with browser console open checking for any import-related runtime errors.

---

# PHASE 5 — Fix 2 Concrete React Re-Render Bugs + Context Granularity

**Objective:** fix FE-R1, FE-R2, FE-R6.
**Effort:** 1-1.5 days. **Risk:** Low-Medium.

## 5.1 — FE-R1: gate the live-tracking progress timer — ⚠️ needs your confirmation first

**File:** `frontend/src/modules/customer/components/order/LiveTrackingMap.jsx:211-216`.

The neighboring dot-animation (lines 218-224) is correctly gated to only run while relevant (e.g. while searching for a rider). The progress-bar timer at 211-216 is not gated at all — it runs at 10Hz for as long as tracking is open, regardless of order state. Before this can be called a pure performance fix, one thing needs to be confirmed: **what is this progress value supposed to represent?**
- If it's meant to be a **generic "still working" pulse** shown only during a specific sub-state (e.g. "searching for a rider," matching the dot-animation's gating) — then gating it identically is a pure bug fix with no behavior change (it currently runs even in states where it arguably shouldn't).
- If it's meant to **continuously animate for the entire time tracking is open** as a deliberate design choice (e.g. a decorative "live" pulse on the route line) — then the fix is different: keep it running, but throttle the *re-render* cost (e.g. drive the animation via CSS/a ref instead of a React state update 10x/second) rather than stopping it.

**Do not implement either version until you confirm which behavior is intended** — this is the one item in this plan where guessing could visibly change what the customer sees.

## 5.2 — FE-R2: memoize the seller/admin dashboard context values
**File:** `frontend/src/shared/layout/DashboardLayout.jsx:309-332` (functions), `:426-440` (providers).
**Change:** wrap `refreshOrders`/`refreshEarnings` in `useCallback`, wrap the two context provider `value={...}` objects in `useMemo` with tight dependency arrays (the actual data + the now-stable callback refs).
**Behavior check:** none — this changes *when* consumers re-render, never *what data* they receive. The accept-order countdown timer's own visible ticking is untouched (it's a separate local state update in the modal itself); only the *unrelated* Orders-table re-render side-effect is removed.
**Acceptance:** with React DevTools Profiler, confirm `Orders.jsx`/Dashboard/Earnings no longer re-render on every 1000ms countdown tick while the new-order modal is open; confirm order/earnings data still updates correctly when it actually changes.

## 5.3 — FE-R6: split cart/wishlist context to reduce re-render blast radius
**Files:** `modules/customer/context/CartContext.jsx`, `WishlistContext.jsx`, consumed in `ProductCard.jsx`.
**Change:** lowest-risk option — keep the context as-is but have `ProductCard` derive its own membership (`isInCart`/`isInWishlist`, quantity) via a small selector hook that only triggers a re-render when *that specific product's* membership changes, rather than subscribing to the whole array reference directly. (This can be done without introducing a new state library — e.g. a `useSyncExternalStore`-based selector over the existing context value, or splitting the context into a stable "actions" context + a granular "data" context.) Do not change the underlying cart/wishlist data model or API — this is purely about *which components re-render when it changes*.
**Behavior check:** cart/wishlist add/remove must behave identically from the user's perspective (same optimistic-update timing, same final state); only the *scope* of what re-renders shrinks.
**Acceptance:** tapping "ADD" on one product in a 40+ card grid, verified via Profiler, only re-renders that card (plus any cart-count badge in the header), not the full grid.

---

# PHASE 6 — Image Resizing at Serve Time + on New Uploads

**Objective:** fix BE-I1. Highest-impact backend fix in this plan; done carefully to avoid touching anything already stored.
**Effort:** 1.5-2 days. **Risk:** Medium (only because it's high-traffic code, not because the mechanism is risky).

### P6-1: Apply Cloudinary transform params when *serving* product/category/banner images to clients
**Files:** wherever product/category/banner image URLs are read and returned in API responses (`productController.js` selects at lines 366, 489, 1050, 1233 per Part 1; category/offer/banner equivalents).
**Change:** at serve time only (never touching the stored `secure_url`), apply the existing `getTransformedUrl()` helper (`mediaMetadata.js:212-251`) or append Cloudinary transform path segments (`w_400,q_auto,f_auto` or similar, tuned per usage context — grid thumbnail vs. detail-page hero image need different target widths) before returning the URL. **Nothing stored in the database changes** — this is a presentation-layer transform applied to an already-Cloudinary-hosted URL, which Cloudinary generates on-the-fly and CDN-caches.
**Behavior check:** the *visual* image must look the same (properly resized/compressed, not visibly degraded — tune `q_auto` and target width per context, don't default to an aggressively low quality); confirm no code anywhere compares/persists the raw URL string in a way that a transform-parameter change would break (e.g. a dedup check keyed on exact URL match) — audit call sites before shipping.
**Acceptance:** product grid pages show materially smaller image payloads in Network tab (compare against Phase 0 baseline); images remain visually correct at their actual display size across all 4 portals; no broken-image regressions in the smoke test.

### P6-2: Enable dimension resizing on new uploads going forward
**Files:** `mediaService.js:204-241`, `cloudinaryProvider.js:88-98`.
**Change:** add a sensible max-dimension cap (e.g. 2000px longest edge — generous enough that no legitimate use case needs more, but caps phone-camera originals) to the upload transform options, and un-comment/enable `CLOUDINARY_IMAGE_UPLOAD_FORMAT`/`CLOUDINARY_IMAGE_UPLOAD_QUALITY` in the deployed environment (not just `.env.example`).
**Behavior check:** uploaded images must remain visually acceptable at every size they're actually displayed at (verify against the largest display context, e.g. a product detail hero image) — this is a one-way change for *newly uploaded* images only; **do not** attempt to reprocess already-stored historical images in this phase (that's a separate, higher-risk backfill decision, not in scope here unless you ask for it).
**Acceptance:** new test uploads across product photos, review photos, KYC docs, and banners come back appropriately sized; existing historical images are untouched and continue to work exactly as before.

---

# PHASE 7 — Restructure the 4 Slowest Backend Queries

**Objective:** fix BE-D2, BE-D3, BE-D4, BE-D5, BE-D6, BE-D7. The heaviest-engineering phase; each ticket's #1 acceptance criterion is "identical response shape," since these endpoints feed existing, unmodified UI.
**Effort:** 3-4 days. **Risk:** Medium.

### P7-1: Admin Customer Management — restructure to match-then-limit-then-lookup
**File:** `backend/app/services/admin/userAdminService.js` (`getUsersData`).
**Change:** restructure the aggregation so `$match` + `$sort`(on an indexed, cheap field) + `$skip`/`$limit` happen **before** the `$lookup` into Orders — i.e., only join the current page's ~25 customers against their orders, not the entire matching set. If sorting by `totalOrders`/`totalSpent` (computed fields) is a hard product requirement that can't be done pre-join, the fallback is to cache the per-customer aggregate stats (mirroring the `sellerStatsService.js` precompute+cache pattern) with a short TTL and invalidate on order-completion events, rather than recomputing the full join on every page view. Also add `.lean()` to `getUserByIdData`'s order fetch.
**Behavior check — critical:** response field names, types, sort order, and pagination metadata (total count, page size) must be byte-for-byte identical to today for the same underlying data; the admin frontend for this page must not need any change.
**Acceptance:** response shape diff (old vs. new) is empty for a fixed test dataset; p95 latency drops materially per Phase 0 baseline; correct behavior verified at page 1, a middle page, and the last page (boundary conditions for the restructured skip/limit logic).

### P7-2: Admin Seller Directory — paginate at the query level, not in JS
**File:** `backend/app/services/admin/sellerDirectoryService.js` (`getSellerLocationsData`, `getActiveSellersData`).
**Change:** apply `.limit()`/`.skip()` (or cursor pagination) directly in the `Seller.find()` calls instead of fetching the whole collection and slicing in Node; scope the Order/Product aggregations to only the current page's seller IDs, not the full filtered set. Cache the filter-dropdown-options query (rarely changes) with a short TTL.
**Behavior check:** identical response shape and identical filtering/sorting results for the same query, verified the same way as P7-1.
**Acceptance:** same structure as P7-1.

### P7-3: Seller Earnings — add lean + cache + bounded default range
**File:** `backend/app/controller/sellerStatsController.js` (`getSellerEarnings`).
**Change:** add `.lean()` to the transaction fetch; cache the computed summary (settledBalance/pendingPayouts/totalWithdrawn) with a short TTL and invalidate on new transaction write, mirroring `getSellerStats` in the same file; if the full unbounded history is only ever used to compute these 3 aggregate numbers (not displayed row-by-row), move that computation into a `.aggregate()` pipeline instead of fetch-all-then-reduce-in-JS — but only if confirmed the raw transaction list isn't *also* rendered as a table somewhere that needs every row (check the seller Earnings page's actual UI before deciding between "aggregate in Mongo" vs. "keep the list but paginate + cache it").
**Behavior check:** the 3 computed balance figures and the 6-month chart data must be numerically identical to today for the same underlying transactions.
**Acceptance:** numeric parity verified against a fixed test seller's transaction history, before/after; p95 latency drop confirmed.

### P7-4: Delivery available-orders feed — parallelize independent branches
**File:** `backend/app/services/orderQueryService.js` (`fetchAvailableOrdersForDelivery`).
**Change:** wrap the independent branches in `Promise.all` — specifically, the return-pickup lookup (#1) can run parallel to the rider lookup (#2); once seller IDs are resolved (#3), the v2-orders/legacy-orders/return-broadcast queries (#4/#5/#6) are independent of each other and can run together.
**Behavior check:** the final merged/deduplicated result set returned to the client must be identical (same orders, same ordering if ordering is currently meaningful) — parallelizing independent queries doesn't change what each query returns, only when they run.
**Acceptance:** response payload identical for a fixed test scenario (same rider, same location, same open orders) before/after; p95 latency drop confirmed, especially under concurrent-rider load.

### P7-5: Raise the DB connection pool size
**File:** `backend/app/dbConfig/dbConfig.js:14-21`.
**Change:** raise `maxPoolSize` from 10 toward a value sized to actual concurrent load (start with a conservative bump — e.g. 25-50 — and tune based on Phase 0's concurrent-load baseline and your MongoDB Atlas tier's own connection limit, since a pool larger than what your Atlas tier allows will just fail to connect; **this is where the "what's your Atlas tier" question from the README matters most**).
**Behavior check:** none functionally — this only affects how many queries can run concurrently, not what they return.
**Acceptance:** under Phase 0's concurrent-load test replayed post-change, no request queuing/timeout observed at load levels that previously caused it; confirm Atlas tier's max-connections limit isn't being approached (`maxPoolSize × number of app instances` must stay under that ceiling).

### P7-6: Batch the sequential per-item writes
**Files:** `multiSellerCheckoutService.js:197-216`, `stockService.js:52-138`.
**Change:** replace the per-item `StockHistory.create()` calls inside the loop with a single `StockHistory.insertMany([...], {session})` after the loop collects all entries; leave the `Product.findOneAndUpdate`/`save()` calls sequential (session constraint) but confirm this is the only remaining serialization point. For `notification.service.js:227-260`, wrap the per-recipient loop in `Promise.all`/`Promise.allSettled` matching the already-correct pattern used in `broadcastNotification`.
**Behavior check:** each `StockHistory` record created must be identical to today (same fields, same values) — only the write mechanism (one bulk call vs. many single calls) changes; notification delivery must reach the same recipients with the same content, just concurrently instead of sequentially.
**Acceptance:** stock history records verified identical for a fixed test checkout, before/after; checkout transaction duration drops for multi-item/multi-seller carts.

---

# PHASE 8 — Adopt a Shared Frontend Data Cache (Page-by-Page)

**Objective:** fix FE-R5. The largest-effort item in this plan, and the most likely to meaningfully fix "feels slow moving between pages." Deliberately sequenced **last** among the code-change phases because it touches the most files (114+) and carries the most risk of subtle regressions if rushed.
**Effort:** 2-3 weeks, incremental. **Risk:** Medium-High if rushed; Low if done page-by-page as prescribed.

### P8-1: Decide on the mechanism
Two viable options — this needs a decision, not an assumption:
- **(a) Extend the existing `dedupe.js` pattern** to more call sites — lowest new-dependency risk, smallest conceptual change, but you still hand-roll cache invalidation per page.
- **(b) Adopt a dedicated library** (e.g. TanStack Query) for stale-while-revalidate caching, automatic refetch-on-window-focus, and built-in invalidation — more powerful and less code long-term, but a new dependency and a bigger initial learning/setup cost.
Recommend (b) for the pages that get touched most often (admin/seller list pages, which are the ones generating the most re-fetch complaints), given the codebase already has zero server-state library today and this is exactly the gap flagged as F6 in the pre-existing `refactor_plan_part1.md`.

### P8-2: Migrate incrementally, highest-traffic pages first
**Order of migration** (highest impact first, matching the existing page-by-page migration pattern already used successfully for the admin/seller design-system rollout — see project memory): admin Orders/Products/Customers list pages → seller Orders/Products/Earnings → delivery available-orders/earnings → remaining admin/seller pages → customer pages (lower priority; already partially covered per FE-R5's "customer portal partial" note).
**Behavior check per page migrated:** the page's displayed data must be identical to a fresh fetch (accounting for intentional staleness windows you configure); loading/error states must behave the same or better (a cached page showing stale-then-fresh data instead of a blank spinner is an *improvement*, not a behavior change, but confirm this is desired — some pages showing financial data might specifically want to force a fresh fetch rather than show anything stale, even briefly).
**Acceptance per page:** navigate away and back within the cache TTL — data appears instantly (no loading skeleton) and matches what a fresh fetch would show; navigate away and back after the TTL — a background refetch occurs and updates data without a jarring full-page loading state if avoidable.

---

# PHASE 9 — Remaining Polish

**Objective:** fix FE-R7, FE-R8, FE-B7, FE-B8/INFRA2, FE-B9, BE-I4, BE-I6, FE-R9/R10/R11. Lower individual impact; batch these opportunistically once Phases 1-8 are done, or interleave with other frontend/backend work.
**Effort:** ongoing, low-priority backlog. **Risk:** Low.

- **FE-R7:** add virtualization (e.g. `react-window`) to `DataTable.jsx` for any list page that can exceed ~100 rows; leave small paginated lists as-is (not worth the complexity).
- **FE-R8:** blanket pass adding `loading="lazy"` + explicit dimensions to the remaining ~75% of `<img>` tags; start with admin/seller table thumbnails (highest row-count exposure).
- **FE-B7:** convert `deliveryIcon.png` and `image.png` to WebP/SVG at their actual display size.
- **FE-B8/INFRA2:** add explicit long-lived `Cache-Control: public, max-age=31536000, immutable` headers for hashed `/assets/*` paths in `vercel.json`.
- **FE-B9:** continue the already-tracked, in-progress `.ds-*` → design-token migration (see project memory — this is already a known, active effort; not new scope introduced by this plan).
- **BE-I4:** either wire the existing-but-unused `searchService.js` pipeline into the live search route, or (lower effort) anchor/index-friendly-ify the regex fallback if full search-index adoption is out of scope for now.
- **BE-I6:** add cache headers to the `/uploads` static mount, conditional on confirming local storage is actually used in production.
- **FE-R9/10/11:** gate `FleetTracking.jsx`'s poll on tab visibility; consolidate delivery app's polling intervals if a lower total timer count is achievable without losing responsiveness; migrate hand-rolled debounce call sites to the shared `useDebounce` hook opportunistically during other edits to those files (not worth a dedicated pass).

---

# PHASE 10 — Hosting Region Migration (INFRA1) — requires your decision

**Objective:** fix INFRA1, the single highest-impact finding in this entire audit, and structurally different from every other phase — it's an infrastructure/business decision with cost and migration-risk implications, not a code change.
**Effort:** 1-3 weeks depending on approach chosen. **Risk:** High (requires a real cutover plan, DNS changes, and careful testing — the kind of change that needs its own dedicated plan, not a line item here).

This plan intentionally does **not** prescribe a specific target (e.g. "move to AWS ap-south-1") because that decision depends on factors outside this codebase audit: your current Render contract/cost, team familiarity with alternative platforms, acceptable migration downtime window, and whether a CDN/edge-caching layer in front of the current Oregon deployment could capture most of the benefit for cacheable responses without a full migration (a materially lower-risk, lower-effort partial fix worth evaluating first).

**Recommended next step, not a ticket:** once you've reviewed this finding, tell me which of these directions you want explored, and I'll build out a dedicated migration plan with the same rigor as the phases above:
1. Full backend migration to an India/Singapore-region host.
2. Keep Oregon, but front cacheable GET responses (the ones fixed in Phase 1, plus category/product-list/product-detail which are already cached) with a CDN/edge layer physically close to India, cutting round-trip time for the *cacheable* fraction of traffic without touching uncacheable writes (checkout, auth, order placement).
3. Do nothing for now, revisit after Phases 1-9 are shipped and their combined impact is measured against the Phase 0 baseline — since several of those fixes (esp. Phase 1 caching, Phase 6 image sizing, Phase 7 query restructuring) reduce work-done-per-request, which partially masks (but does not eliminate) the fixed network round-trip tax.
