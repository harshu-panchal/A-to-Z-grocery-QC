# Appzeto Quick-Commerce — Performance Audit
## Part 1 of 2: Full Findings Catalog

> Every finding has an ID (`FE-B*` = Frontend Build/Bundle, `FE-R*` = Frontend Runtime, `BE-D*` = Backend DB/Query, `BE-I*` = Backend Infra/Caching/Media, `INFRA*` = Deployment). File:line references were captured during this audit — re-verify exact line numbers before editing, since the codebase moves.
>
> Every finding is written to answer three questions: **what** is the mechanism, **why** does a real user feel it, **who** (which portal/flow) is affected.

---

# 1. Frontend Build & Bundle (`FE-B`)

**Method used:** read the router/app-shell source, grepped every heavy dependency's import sites, then ran an actual `npm run build` and inspected real `dist/assets/` byte sizes and the real `modulepreload` graph in `dist/index.html` — these are measured facts, not estimates.

**Headline number:** every visitor to **every portal** currently downloads, before anything renders:
- Entry chunk `index-*.js`: **1,596 KB raw / ~400 KB gzip**
- `vendor-motion-*.js` (framer-motion): 138.8 KB / 46.3 KB gzip
- `vendor-mui-*.js` (MUI+Emotion): 83.3 KB / 30.8 KB gzip
- `vendor-charts-*.js` (recharts): 407.4 KB / 117.7 KB gzip
- `index-*.css`: 231 KB / 32.5 KB gzip

**Total ≈ 2.46 MB raw / ~627 KB gzip before a single portal-specific line of code runs.** All three "vendor-*" chunks are proven eager (not lazy-for-later) because `dist/index.html` inserts `<link rel="modulepreload">` for them — a hint Vite only emits for the entry's *static* import graph, never for `React.lazy()` dynamic-import chunks.

### FE-B1 — Critical — The 5 portal auth/entry screens are statically imported, defeating all downstream code-splitting
`frontend/src/core/routes/AppRouter.jsx:19-23`:
```js
import Auth from '../../modules/seller/pages/Auth';
import AdminAuth from '../../modules/admin/pages/AdminAuth';
import DeliveryAuth from '../../modules/delivery/pages/DeliveryAuth';
import CustomerAuth from '../../modules/customer/pages/CustomerAuth';
```
`AppRouter.jsx` loads synchronously from `App.jsx` → `main.jsx`, so every top-level import inside it is forced into the entry chunk. This is the root cause of FE-B2, FE-B3, FE-B5, FE-B6 below — heavy, portal-specific dependencies used only by these login screens ship to 100% of users of 100% of portals. The pattern for the fix already exists in the same file: `SellerModule`/`AdminModule`/`DeliveryModule` (lines 52-54) **are** correctly `lazy()`-wrapped — only the 5 auth/entry screens were missed.
**Affects:** all portals. **Impact:** root cause, ~500KB+ of avoidable eager bytes.

### FE-B2 — Critical — `tesseract.js` (delivery OCR feature) is baked into every portal's entry chunk
`frontend/src/modules/delivery/pages/DeliveryAuth.jsx:27` imports `tesseract.js` (used for ID-document OCR during delivery-partner signup only). Confirmed physically inlined in `index-*.js` (5 occurrences of `createWorker`, 3 of `langPath`). The multi-MB wasm/model files are fetched from CDN only at OCR-run time (not bundled), but the 63KB JS wrapper itself is eager for every customer/seller/admin who never touches this feature.
**Affects:** customer, seller, admin (delivery is the only portal that legitimately needs it).

### FE-B3 — Critical — `manualChunks` vendor-splitting accidentally cross-contaminates chunks, forcing MUI + Recharts eager for everyone
`frontend/vite.config.js:44-58`. Evidence from the real bundle: `vendor-charts-*.js` imports core React bindings from `vendor-motion-*.js`, and the entry chunk imports `clsx` (a ~500-byte string-join utility used by the `cn()` helper in nearly every shared UI component across all 4 portals) **from the MUI chunk** — because Rollup's chunk-splitting assigned `clsx` to whichever manual-chunk bucket claimed it first. This single misassignment forces all of `@mui/material` + `@mui/icons-material` + `@emotion` (83KB) and, transitively, Recharts (407KB) to be eager — **490KB / 148KB gzip** that only admin/seller/delivery analytics pages actually need.
**Affects:** all portals. **Impact:** single largest avoidable byte count found in the whole audit.

### FE-B4 — High — Customer app shell + 5 context providers load even for pure admin/seller/delivery sessions
`AppRouter.jsx:10-16` (`WishlistProvider`, `CartProvider`, `CartAnimationProvider`, `ProductDetailProvider`, `LocationProvider`) and `:63` (`CustomerLayout`), consumed by a non-lazy `CustomerLayoutWrapper` (lines 65-89). An admin-only or seller-only session still pays for the entire customer cart/wishlist/location stack.
**Affects:** seller, delivery, admin.

### FE-B5 — High — Seller's Auth page eagerly pulls in the Google Maps loader
`frontend/src/modules/seller/pages/Auth.jsx:32` imports `MapPicker` (`frontend/src/shared/components/MapPicker.jsx`), which imports `@react-google-maps/api`. Confirmed in the entry bundle (9 occurrences of `GoogleMap`/`useJsApiLoader`/`LoadScript`). Only needed once, during seller store-location onboarding.
**Affects:** customer, delivery, admin.

### FE-B6 — High — 3 Lottie animation JSON payloads (~302KB) are statically imported and inlined as JS
`Auth.jsx:30` (seller) → `INSTANT_6.json`, 213,677 bytes. `DeliveryAuth.jsx:22` → `Delivery Riding.json`, 81,021 bytes. `AdminAuth.jsx:18` → `Backend Icon.json`, 8,249 bytes. Vite inlines statically-imported `.json` as a JS object literal, parsed on every load regardless of portal. The correct pattern already exists elsewhere in the same codebase — `frontend/src/modules/customer/components/shared/MainLocationHeader.jsx:159` correctly does `import("../../../../assets/lottie/shopping-cart.json")` (dynamic) — it just wasn't applied to the auth pages.
**Affects:** all portals.

### FE-B7 — Medium — Grossly oversized, unoptimized PNG assets
`frontend/src/assets/deliveryIcon.png` = **2.1MB**, used as a *map marker icon* in `DeliveryTrackingMap.jsx:6` and `LiveTrackingMap.jsx:16`. `frontend/src/assets/image.png` = **1.1MB**, used as an auth-page background in `CustomerAuth.jsx:19`. Neither is in the eager JS path (binaries load only when their component mounts), but a 2.1MB image for a small map pin is a real, easy-to-fix waste on the mobile-cellular audience this app targets.
**Affects:** customer, delivery.

### FE-B8 — Medium-High — No cache-control headers for hashed static assets
`frontend/vercel.json` sets only a `Permissions-Policy` header; there is no explicit `Cache-Control`/`immutable`/`max-age` rule for `/assets/*`. Vite's hashed filenames are safe to cache forever, but without an explicit header contract, **repeat visits may re-download the full ~2.46MB shell** instead of hitting browser cache.
**Affects:** all portals, every repeat visit — this compounds every other finding in this section on every return visit.

### FE-B9 — Medium — Two parallel CSS design systems ship globally on every page
`frontend/src/index.css:1-2` imports both Tailwind and the legacy `frontend/src/styles/design-system.css` (546 lines, `.ds-*` token system). Grep confirms `.ds-*` classes are still actively used in **21 files**, mostly the delivery module (`Dashboard.jsx`, `CodCash.jsx`, `OrderHistory.jsx`, profile pages) plus a few admin pages. This matches the known, already-tracked, in-progress design-system migration (see project memory) — it's real bytes (contributes to the 231KB/32.5KB gzip CSS total) but not large relative to the JS findings above.
**Affects:** all portals.

### Verified OK — no action needed
- **No offline/asset-caching service worker exists** (`frontend/src/sw/firebase-messaging-sw.js` is confirmed push-notification-only). A missed opportunity for instant repeat loads, not a defect.
- **Tailwind v4 content-scanning is correctly configured** (no `node_modules` bloat).
- **`firebase` (178KB/54KB gzip) is correctly lazy** — proof the lazy-loading pattern already works correctly elsewhere in this codebase; the fix for FE-B1/2/5/6 is to copy this existing pattern, not invent a new one.

---

# 2. Frontend React Runtime (`FE-R`)

**Method used:** read context providers, timers, list-rendering, image handling, and the largest monolithic page files across all 4 portals.

### FE-R1 — Critical — Unconditional 100ms timer re-renders the customer live-tracking map for its entire open duration
`frontend/src/modules/customer/components/order/LiveTrackingMap.jsx:211-216`:
```js
setInterval(() => setProgress((p) => (p + 0.5) % 100), 100)
```
Runs unconditionally (not gated by order `status`/`isSearching`, unlike the neighboring dot-animation at lines 218-224 which *is* gated) for as long as the customer has order tracking open — 10 re-renders/second of a `GoogleMap`+`Marker`+`Polyline` tree. Directly causes scroll/interaction jank on the order-tracking screen.
**Affects:** customer. **See Part 2 §5.1 — needs a quick confirm on intended animation behavior before fixing.**

### FE-R2 — High — Non-memoized context re-renders the seller/admin Orders table once a second
`frontend/src/shared/layout/DashboardLayout.jsx:426-440`. `SellerOrdersContext`/`SellerEarningsContext` provider values are plain object literals rebuilt every render, and `refreshOrders`/`refreshEarnings` (lines 309-332) are plain functions, not wrapped in `useCallback`. `DashboardLayout` wraps every admin and seller route and re-renders whenever the accept-order countdown ticks (every 1000ms while the "New Order" modal is open, lines 352-360). Each tick recreates both context values, forcing every consumer (`seller/pages/Orders.jsx`, Dashboard, Earnings) to re-render — independent of whether the underlying data changed. **Concrete symptom:** a seller has the new-order popup open and the Orders table underneath silently re-renders every second.
**Affects:** admin, seller.

### FE-R3 — High — Inline component definitions remount the entire product table on every keystroke
`frontend/src/modules/admin/pages/ProductManagement.jsx:375-391`. `StatusBadge` and `ApprovalBadge` are defined as component functions **inside the page's render body**, and the `columns` array referencing them is rebuilt every render. New function identity every render ⇒ React treats them as different component types across renders ⇒ **full unmount/remount** of every badge cell in the visible table on each re-render. Because the edit-modal's form state (`formData`) lives in this same component, **typing a single character while editing a product remounts every status/approval badge in the background table.**
**Affects:** admin.

### FE-R4 — High — Customer catalog fetch has no pagination and renders unbounded lists with no virtualization
`frontend/src/modules/customer/pages/CategoryProductsPage.jsx:53-58` calls `customerApi.getProducts({ categoryId, lat, lng })` with **no `limit`/`page` parameter** — the entire category's product list returns in one response and is fully rendered (`:214`) with no windowing. For a category with hundreds of SKUs, this is real scroll-jank risk on mobile. Contrast: `Home.jsx:258` correctly caps at `limit: 20`.
**Affects:** customer.

### FE-R5 — High — Near-total absence of a shared fetch cache; every page navigation re-fetches from scratch
`frontend/src/core/api/dedupe.js` (`getWithDedupe`, 30s in-flight dedupe) is used in only **4 files**. A repo-wide grep found **389 direct, uncached `axiosInstance.get`/`adminApi.*`/`sellerApi.*`/`deliveryApi.*` calls across 114 other files**, each backed by page-local `useState`+`useEffect`. There is no route-level or back/forward cache anywhere else. **This is the direct root cause of "the app feels slow just moving between pages I've already been on"** — navigating Admin Products → Orders → back to Products always shows a full loading skeleton and re-fetches everything. Applies most to admin/seller/delivery; the customer portal is partially better covered since `customerApi.js` itself routes several calls through the dedupe helper.
**Affects:** admin, seller, delivery (heaviest); customer (partial).

### FE-R6 — Medium — Cart/Wishlist context granularity re-renders every visible product card on any single mutation
Cart/Wishlist context values are correctly memoized, but each holds one flat array. Any cart/wishlist mutation anywhere in the app changes that array's reference, and every `<ProductCard>` on screen subscribes directly to the context — so tapping "ADD" on one product re-renders **every** mounted `ProductCard` in the visible grid (`React.memo` doesn't help since the re-render is context-driven, not prop-driven). On a 40-100+ card catalog grid (see FE-R4), this multiplies the cost of a single tap.
**Affects:** customer.

### FE-R7 — Medium — Shared `DataTable` renders every row twice into the DOM simultaneously
`frontend/src/shared/components/ui/DataTable.jsx:32-136` renders the full row set once into a desktop `<table>` and again into a mobile card list, with only CSS (`hidden md:block` / `md:hidden`) deciding visibility — so the DOM always holds ~2N row elements for N fetched rows, no windowing. Impact is moderated today because most admin pages already paginate server-side (25-50 rows typical), but any page that ever fetches an unbounded list pays double DOM cost with zero virtualization.
**Affects:** admin, seller (all `DataTable` consumers).

### FE-R8 — Medium — ~75% of `<img>` tags lack lazy-loading and explicit dimensions
111 `<img>` tags across 70 files; only 27 tags in 22 files (~24%) use `loading="lazy"`. The remaining ~75% (seller/admin product-management thumbnails, avatar/profile images across admin lists, delivery order-detail images) fire their image request immediately on mount with no intrinsic `width`/`height`, causing both eager loading of off-screen images and layout shift while each image loads. `ProductCard.jsx:253-259` shows the correct pattern already in use elsewhere (lazy + Cloudinary-transformed URL) — it's inconsistently applied, not unknown.
**Affects:** all portals, heaviest in admin/seller tables.

### FE-R9 — Medium — Delivery app runs 3-4 concurrent polling timers on the rider's phone
`frontend/src/modules/delivery/layout/DeliveryLayout.jsx`: available-orders poll (15s base, backoff to 60s, `:403`), notifications poll (25s base, backoff to 90s, `:639`), a 30s geolocation heartbeat (`:475-498`), and during an active alert a 1200ms ringtone-retry interval (`:73-79`) can all run concurrently. Each is individually visibility/focus-gated and reasonable in isolation, but together represent a real, if modest, battery/CPU cost on a rider's phone running the app all shift.
**Affects:** delivery.

### FE-R10 — Low — Two admin polling/timer issues
`frontend/src/modules/admin/pages/FleetTracking.jsx:69` — 30s full-refetch poll **not** gated by `document.visibilityState` (unlike nearly every other poll in the app), keeps hitting the API while the tab is backgrounded. `frontend/src/modules/admin/pages/FleetRadar.jsx:29` — a 1s `setInterval` re-renders the whole page just to redraw a clock string against a currently-mock/unwired fleet array; low impact only because the underlying data isn't real yet.
**Affects:** admin.

### FE-R11 — Low — Debounce hook exists but is only used in 5 of ~17 places that need it
`frontend/src/shared/hooks/useDebounce.js` (250ms default) is imported in only 5 files; roughly a dozen other search/filter inputs across admin/seller pages hand-roll their own local `setTimeout` debounce instead. Functionally these all work today — this is duplication/maintainability risk (one could be implemented wrong later), not an active perf bug.
**Affects:** admin, seller.

### Verified OK — no action needed
- `AuthContext.jsx` does **not** derive role from `window.location.pathname` on every render (an earlier architecture note was stale) — it already reads from a memoized module-level store (`core/auth/activeRoleStore.js`) updated once on router mount.
- All other context providers checked (Settings, SidebarBadges, SupportUnread, Cart, Wishlist, Location, CartAnimation) are correctly `useMemo`-wrapped.
- Most polling in the codebase (delivery notifications, admin sidebar badges, seller order sync, map recenter timers) is well-engineered: visibility-gated, with backoff, using `AbortController`.
- No `motion.*` component found wrapping every row of a long list (the specific "animation cost multiplied by list length" anti-pattern was checked for and not found in the files sampled).
- Search/filter debounce that does exist (whether via the shared hook or hand-rolled) is functionally correct everywhere it was checked.

---

# 3. Backend Database Queries & Indexing (`BE-D`)

**Method used:** cross-checked every index declared in `databaseIndexManager.js` and in-schema `index()` calls against the real field names in each model file, and against the real query filter shapes used in the hottest controllers/services.

### BE-D1 — Critical — Index manager builds indexes on a phantom collection; the real, hot collection gets none of them
`backend/app/services/databaseIndexManager.js:89-93` declares indexes (`phone`, `email`, `createdAt`) on collection name `customers`. But `backend/app/models/customer.js:165` registers `mongoose.model("User", userSchema)`, which Mongoose pluralizes to collection **`users`** — there is no `Customer` model anywhere in the codebase. `createAllIndexes()` runs on **every server boot** (`backend/app/core/startup.js:268`), so this silently creates 3 indexes on an empty, never-queried `customers` collection while the real `users` collection — hit by every customer auth lookup and every admin customer-list query — never gets the intended `createdAt` index from this manager (phone/email are separately covered by schema-level `unique:true`, so only the `createdAt` index is actually lost, but it's lost on the collection every admin customer list sorts by).
**Affects:** customer auth flows, admin Customer Management.
**Note:** this is the exact same bug class the pre-existing `database_audit_plan` already found and fixed for a `withdrawals` collection — this one was missed in that earlier pass.

### BE-D2 — Critical — Admin's Customer Management page joins every customer against their full order history before paginating
`backend/app/services/admin/userAdminService.js:5-60` (`getUsersData`, backing the admin Customer Management list): `$match(role:"user")` → `$lookup` **every** matching user against the **entire** `orders` collection (unbounded, `foreignField:"customer"`) → computes `totalOrders`/`totalSpent`/`lastOrderDate` → `$sort` → only **then** applies `$skip`/`$limit` inside a `$facet`. Because the limit is applied after the join, Mongo must join and score every customer's full order history on every single page view — cost scales as O(all customers × their orders), uncached, and grows worse as the business grows. `getUserByIdData` (line 62) has the same per-customer `$lookup` pattern for the detail page, plus fetches recent orders **without `.lean()`** even though the result only ever gets serialized to JSON.
**Affects:** admin (Customer Management is one of the most-visited admin screens). **Likely the single largest admin-portal slowdown found in this audit.**

### BE-D3 — Medium-High — Admin seller directory loads the entire Seller collection and paginates in application memory
`backend/app/services/admin/sellerDirectoryService.js`:
- `getSellerLocationsData` (lines 59-66): an unbounded `Seller.find(...)` **plus** a second unbounded `Seller.find({}).select("address category")` just to compute filter-dropdown options — both fetch every seller, every request, then filter/sort/`.slice()` in Node.
- `getActiveSellersData` (lines 269-309): three separate unbounded/near-unbounded `Seller.find` calls, then `Order.aggregate`/`Product.aggregate` scoped to **all** matching sellers (not just the current page) before pagination is applied in JS.
Three admin endpoints affected (seller map, active-sellers list, filter dropdowns), all uncached. Less catastrophic than BE-D2 since the Seller collection is typically much smaller than Orders, but it scales directly with seller count.
**Affects:** admin.

### BE-D4 — High — Seller Earnings page: unbounded, non-lean, uncached full transaction history
`backend/app/controller/sellerStatsController.js:32-34` (`getSellerEarnings`): `Transaction.find({user, userModel:'Seller'}).sort({createdAt:-1}).populate("order","orderId")` — no `.limit()`, no `.lean()`. Fetches a seller's **entire** transaction history (every payment, withdrawal, refund, incentive — potentially thousands of rows for an established seller), hydrates full Mongoose documents, populates every order, then runs 4 separate `.filter()/.reduce()` passes in JS to compute balances. A second unbounded `Transaction.aggregate` runs for the 6-month chart. None of it is cached. The sibling `getSellerStats` in the *same controller* correctly delegates to a 60s-cached, well-built `$facet` service — `getSellerEarnings` is the one endpoint that never got the same treatment.
**Affects:** seller (Earnings tab — a top-visited seller page).

### BE-D5 — High — Delivery's "available orders" feed makes up to 6 sequential DB round-trips
`backend/app/services/orderQueryService.js:254-394` (`fetchAvailableOrdersForDelivery`) — backing the delivery app's core nearby/available-orders screen, almost certainly polled repeatedly by every online rider. Runs, fully sequentially: (1) return-pickup order lookup, (2) `Delivery.findById` (independent of #1), (3) nearby-seller geo lookup (depends on #2), then (4) v2 orders, (5) legacy orders, (6) return-pickup broadcast — where #4/#5/#6 all depend only on the seller-ID list from #3 and are independent *of each other*. None of this uses `Promise.all`. On a polling endpoint hit continuously by every online rider, this roughly triples-to-quadruples p95 latency versus what's achievable by parallelizing the independent branches.
**Affects:** delivery.

### BE-D6 — Medium-High — DB connection pool capped well below what 4 concurrent apps need
`backend/app/dbConfig/dbConfig.js:14-21` explicitly sets `maxPoolSize: 10, minPoolSize: 5` — below the Mongoose/Node driver's own default of 100. One Node process serves customer, seller, delivery, and admin simultaneously; several endpoints found elsewhere in this audit fan out to many concurrent queries per single request (e.g. `getModerationProducts`/`getSellerProducts` each run 9 `Promise.all`'d queries; `getActiveSellersData` runs 6+). With a pool of 10, a handful of concurrent admin/seller dashboard loads can saturate it and queue every *other* request — including customer checkout and delivery polling — behind them. `bufferCommands` is left at its default (`true`), which silently queues rather than fails fast, masking the exhaustion instead of surfacing it. **This is a strong structural match for "everything feels slow at once, all portals, no single culprit page."**
**Affects:** all portals, simultaneously, under any concurrent load.

### BE-D7 — Medium — Sequential per-item DB round-trips inside checkout and notification fan-out
`backend/app/services/multiSellerCheckoutService.js:168-216` and `backend/app/services/stockService.js:52-138` — nested loops doing one `Product.findById`/`findOneAndUpdate` + one `save()`/`StockHistory.create()` **per line item**, sequentially, inside a single MongoDB transaction session (session constraints mean this can't be naively wrapped in `Promise.all`, but the `StockHistory.create()` calls could be batched into one `insertMany()` after the loop). For a 3-seller, 3-item cart this is ~18 sequential round-trips inside a 30s transaction timeout — real added checkout latency, and raises timeout risk under load. Separately, `backend/app/modules/notifications/notification.service.js:227-260` (`notify()`) processes each recipient sequentially (3 awaits per recipient) where the sibling `broadcastNotification` function already correctly uses `Promise.allSettled` — an inconsistency, not a hard technical constraint.
**Affects:** customer (checkout latency), all portals (notification delivery lag).

### BE-D8 — Low/Medium — Assorted dead or duplicate index definitions
`databaseIndexManager.js:100-103` declares an index on `wishlists.items.productId`, a field that doesn't exist (the real field is `products`) — dead but harmless (write overhead only, no query relies on it). `:95-98` declares a 3-key index on `deliveries` whose third key (`isActive`) doesn't exist in the schema, degenerating to a duplicate of an existing 2-key schema index — pure write amplification on a write-heavy collection (every rider location ping touches this document). `:124` declares a `ledgerentries` index byte-for-byte identical to one already declared in the schema itself — Mongo maintains two B-trees for the same key combination for no benefit.
**Affects:** write throughput only, not read latency.

### Verified OK — no action needed
- Order and Product schemas are well-indexed: every compound index checked against real field names and real query filters (customer, seller, status, workflowStatus, returnStatus, paymentMode/paymentStatus, checkoutGroupId, categoryId) matches correctly.
- `Seller.location` and `Delivery.location` both correctly declare `2dsphere` indexes; every `$near` usage found (`deliveryNearbyService.js`, `orderQueryService.js`, `customerVisibilityService.js`) correctly queries the indexed field with proper `$geometry`/`$maxDistance` syntax.
- Most list endpoints in `productController.js`, `orderQueryService.js`, `notificationController.js`, and the admin delivery/user-list controllers already use `.lean()`, `Promise.all`, and the shared `pagination.js` utility correctly — the gaps above (BE-D1 through BE-D7) are outliers against an otherwise well-optimized baseline, not the norm.
- `dashboardSummaryService.js` and `sellerStatsService.js` both already use the correct "precompute + cache, early `$match`, single `$facet`" pattern — these are the models to copy when fixing BE-D2/D3/D4.

---

# 4. Backend Infra, Caching, Realtime & Media (`BE-I`)

**Method used:** read the cache service and its call sites, the Socket.IO manager and emitters, the rate limiter, and the full image upload→storage→serve pipeline.

**Note up front:** several hypotheses going into this pass turned out to be **wrong**, worth stating so they aren't re-investigated: Socket.IO already targets per-entity rooms everywhere (no broadcast-to-everyone in any live code path), rider location updates are already throttled server-side before any DB write, order placement already offloads SMS/push notifications off the request path via `setImmediate` + a queue, and geocode/route lookups already check Redis/Mongo before calling Google Maps. The real problems are narrower and listed below.

### BE-I1 — High — Product/category/banner images are stored and served at full original upload resolution
`backend/app/services/mediaService.js:204-241` (the primary signed-upload path) only conditionally adds a `quality` transform — never `width`/`height`/`crop`. `backend/app/services/storage/providers/cloudinaryProvider.js:88-98` has the same gap. `backend/.env.example:134,137` — the two env vars that would enable format/quality optimization are **commented out by default**, so a typical deploy has neither active. The raw `secure_url` (often a multi-MB, 3000×4000px phone photo) is what gets persisted (`productController.js:618,634,804-808,825`) and returned verbatim by every product list/detail endpoint. A correct transform-URL builder (`mediaMetadata.js:212-251`, `getTransformedUrl()`) already exists but is used in exactly one place — a throwaway thumbnail in the upload-confirm response — never when serving images back to any client. One partial mitigation: the local-storage fallback provider does run uploads through `sharp().webp()` for format/quality, but still never resizes dimensions.
**Affects:** every product grid in every portal (customer home/search/category, seller product management, admin catalog). **Likely the single biggest "images take forever to load" cause found in this audit**, and it multiplies bandwidth cost on the most-viewed screens in the app.

### BE-I2 — High — `GET /seller/nearby` (customer app's core location-based discovery) has zero caching
`backend/app/controller/sellerController.js:12-55` runs a `$near` geo query (100km radius) then loops in JS computing per-seller distance/radius filtering, on every call — no `cacheService` import at all. The cache service already defines a 300s TTL for exactly this (`cacheService.js:27`, `nearbySellers`), just never wired up. This is likely one of the very first API calls a customer session makes (app open / location change).
**Affects:** customer.

### BE-I3 — High — `GET /offers` (customer home-screen banners) has zero caching
`backend/app/controller/offerController.js:4-15` — a plain `Offer.find({status:"active"}).populate(...)` on every call, no cache import in the file. Sibling data of the same shape (category tree, settings, hero/experience config) is already correctly cached elsewhere in the same codebase — this endpoint was simply missed.
**Affects:** customer (home screen, hit on essentially every app open).

### BE-I4 — Medium — Product search uses unanchored regex, cannot use an index on first hit
`backend/app/controller/productController.js:240-250,1154-1161` — when the `PRODUCT_SEARCH_USE_TEXT` flag is off (its default), search terms go through an **unanchored** regex (`{ $regex: escaped, $options:"i" }`, no `^`), which cannot use any index and forces a full collection scan. This is cached for 300s per exact query+filter+page combination (`:427-429`), so *repeat* identical searches are cheap, but the *first* hit for any new term is always a full scan, and that scan gets slower as the catalog grows. Separately: a complete, already-built, cache-backed search-index pipeline (`searchService.js`, `searchSyncService.js`, Bull-queued) exists in the codebase but is **never invoked** by the live search route — it was built and then not wired in.
**Affects:** customer (search-as-you-type gets slower as catalog grows).

### BE-I5 — Medium — Upload-confirm does a synchronous Cloudinary verification round-trip inside the request path
`backend/app/services/mediaService.js:420-431` (`confirmUpload`) awaits a Cloudinary Admin API call to verify the asset exists before confirming success — this is a deliberate, documented security check (prevents confirming an upload that was never actually completed), not a bug to simply remove, but it does add a fixed ~100-300ms tax to every "upload a photo" flow across all 4 apps (product photos, review/profile photos, KYC documents, banners/logos).
**Affects:** all portals, any upload flow.

### BE-I6 — Low-Medium — `/uploads` static mount has no cache headers
`backend/index.js:158` — `express.static(...)` for the local-storage fallback has no `maxAge`/`immutable` option, so repeat image loads re-validate with the Node process instead of using browser cache. Scoped only to deployments actually using `STORAGE_PROVIDER=local` in production (the code's own comments say production should front this with Nginx instead) — severity is conditional on whether that's currently the case.
**Affects:** conditional on storage provider config.

### BE-I7 — Informational — Global rate limiter adds a mandatory Redis round-trip to every single request
`backend/app/middleware/securityMiddlewares.js:28-34` + `rateLimiter.js:31-55` — correct, standard distributed-rate-limiting design (this is *not* a bug), but worth naming as a hard dependency: Redis latency/availability sits on the critical path of literally every request across all 4 apps. Flagged for awareness (e.g. when diagnosing a general slowdown, check Redis health first), not as something to change.

### Verified OK — no action needed
- **Socket.IO room targeting is correct everywhere live**: `socketManager.js` joins per-entity rooms (`order:<id>`, `seller:<id>`, `customer:<id>`, `delivery:<id>`, admin rooms) with ownership checks; all emitters target these rooms specifically. One broadcast-to-all-online-riders function (`notifyDeliveryPartners`) exists but has **zero call sites** — dead code, not an active problem, but flagged so nobody wires it up later as a "simpler" alternative to the correctly-targeted broadcast function that's actually in use.
- **Rider location throttling is already correct**: a Redis-backed check rejects GPS pings within 3s/20m of the last accepted one, before any DB write.
- **Order placement is already non-blocking on SMS/push/notifications** — deferred via `setImmediate` and a Bull-backed queue, with inline fallback only if Redis is disabled.
- **Geocoding/routing are already cache-first** — Redis then Mongo checked before any Google Maps API call, on every path checked.
- **Redis client is a reused singleton** with sane retry/backoff — no reconnect-per-request pattern found.
- **Cache coverage that IS correct and can be used as the template for BE-I2/I3**: category tree, settings, hero/experience config, product list, product detail, seller/delivery stats & earnings summaries — all correctly use the existing `getOrSet`/`invalidate` pattern with pub/sub cross-instance invalidation.
- The two similarly-named `rateLimiter.js`/`rateLimiters.js` files are **not** duplicate logic — one is a thin re-export shim. Cosmetic only, not a perf issue.

---

# 5. Deployment / Hosting Configuration (`INFRA`)

**Method used:** read `render.yaml`, `Dockerfile`, `docker-compose.yml`, `k8s/`, `vercel.json`, `.env.example`, and `app/config/redis.js`.

### INFRA1 — High — Hosting region mismatch (India-built app, US-West-hosted backend)
`backend/render.yaml` deploys all three services (`quickcommerce-api`, `-worker`, `-scheduler`) to `region: oregon` (US West). But the app is built entirely for the Indian market: SMS delivery via India-specific "SMS India Hub", and payments via PhonePe (an India-only UPI gateway) — both confirmed in code/config. A round trip from India to US-West Oregon typically adds **~230-280ms of fixed network latency per request** versus an India/Singapore-region host (~20-50ms). For an app where a single user session makes many sequential API calls (browse → cart → checkout → order tracking polling), this compounds into a systemic, uniform "feels slow" experience across the *entire* user base and every single portal — not an edge case, a structural tax on every request. Render has no India region; fixing this requires either migrating to a provider with an Asia-Pacific/Mumbai region (AWS `ap-south-1`, GCP `asia-south1`) or fronting cacheable responses with an edge CDN.
**Affects:** all portals, every request, uniformly. **See Part 2, Phase 10 — this needs a decision from you, not just an engineering ticket.**

### INFRA2 — Low-Medium — `vercel.json` has no explicit Cache-Control headers
Only a `Permissions-Policy` rule is set; no explicit `Cache-Control` for static assets. Vercel applies its own default caching heuristics for hashed build output, but there's no explicit immutable-cache contract — relates to FE-B8 above (same underlying gap, frontend-hosting side).

### INFRA3 — Low (unconfirmed) — A potentially slow Redis startup path exists but no confirmed call site
`backend/app/config/redis.js:201-249` (`waitForRedis`) does exponential backoff up to `maxRetries=10`, worst case summing to several minutes, before logging a warning and continuing (doesn't throw). No call site for this specific function was found in `index.js` within this audit's scope — flagged as a "verify, don't assume" item, not a confirmed live issue.

### Verified OK — no action needed
- **Process-role separation is correctly deployed**: `render.yaml` runs HTTP/worker/scheduler as 3 distinct Render services, matching the role-separation logic in `backend/index.js` — no risk of a background job stealing CPU from live HTTP request handling.
- `Dockerfile` uses a slim `node:18-alpine` base with `npm ci --only=production` — reasonable, no build-stage bloat (no compile step exists for this backend, so single-stage is appropriate, not a shortcut).
- `k8s/` manifests (replicas, resource requests/limits, HPA policy, readiness/liveness probes) all look reasonable if that path is ever used, but `render.yaml` appears to be the actual active deploy target — `k8s/` may be a legacy/secondary path worth confirming.
- `docker-compose.yml` (local Mongo/Redis containers, no resource limits) is dev-only and not part of the production deploy path via `render.yaml` — no production impact.
- `.env.example` shows no unusual hard-coded limits; MongoDB Atlas/Redis tier cannot be determined from this file alone (see README's "needs your input").
