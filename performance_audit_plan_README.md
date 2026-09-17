# Appzeto Quick-Commerce — Performance Audit & Improvement Plan

Full-stack performance audit covering all four client apps (Customer, Seller, Delivery, Admin) and the shared backend, answering: **why does the app feel slow/laggy, and how do we fix it without changing any feature or user-facing flow.**

> **Scope:** `frontend/src/**` (all 4 portals) and `backend/**`.
> **Approach:** every fix below is **additive or mechanical** — caching a read, adding an index, deferring when a script loads, memoizing a value, parallelizing independent DB calls. None of them change a route, a response field, a UI flow, or business logic. Where a fix *could* have a visible side effect, it is called out explicitly and gated behind your sign-off before implementation.
> **Not implemented yet.** This is the analysis + plan only, per your request. Nothing in the codebase has been changed.

## How to read this plan

| File | What's in it |
|---|---|
| [`performance_audit_plan_part1.md`](./performance_audit_plan_part1.md) | The full findings catalog — every root cause found, grouped by layer (frontend build, frontend runtime, backend DB/queries, backend infra/caching/media, deployment), each with exact file:line evidence, why it causes real perceived slowness, which portal(s) it hits, and severity. |
| [`performance_audit_plan_part2.md`](./performance_audit_plan_part2.md) | The phased execution roadmap — 10 phases, ordered by (impact × safety ÷ effort), each independently shippable and independently verifiable, with a "no behavior change" acceptance check on every ticket. |

## How this was produced

Five parallel deep-dive passes, each independently reading source and — where possible — producing hard evidence rather than guesses:
1. **Frontend build/bundle** — read the router and app shell, grepped every heavy dependency's import sites, and **ran an actual production build** (`npm run build`) to get real chunk byte sizes and the real `modulepreload` graph from `dist/index.html`.
2. **Frontend React runtime** — read context providers, polling timers, list rendering, image handling, and the largest monolithic pages for re-render and re-fetch waste.
3. **Backend DB/query/indexing** — cross-checked every declared index against real schema field names and real query filters in the hottest controllers; checked `.lean()`/pagination/populate coverage.
4. **Backend infra/caching/realtime/media** — checked Redis cache coverage, Socket.IO emit targeting, rate limiting, and the image upload→storage→serve pipeline.
5. **Deployment/hosting config** — read `render.yaml`, `Dockerfile`, `k8s/`, `vercel.json`, and `.env.example` for infra-tier and geography clues.

All five explicitly cross-checked their claims against real code (file + line number) rather than assuming from architecture alone — several initial hypotheses from the brief were **disproven** in the process (e.g. Socket.IO already uses targeted rooms, not broadcast; order placement already offloads SMS/push off the request path). Those are recorded in Part 1 too, so this plan doesn't waste effort "fixing" things that already work correctly.

## Top 10 findings (one line each — full detail in Part 1)

1. **INFRA-1 — Hosting region mismatch.** Backend runs on Render Oregon (US West); the app is built entirely for India (SMS India Hub, PhonePe). Every single API call from every app pays a fixed ~230-280ms round-trip tax. This is very likely the single biggest, most uniform contributor to "everything feels slow," and the hardest to fix (needs a hosting decision from you — see Part 2, Phase 10).
2. **BE-I1 — Product/category/banner images are served at original upload resolution.** No resize transform anywhere in the live path (a working `getTransformedUrl()` helper exists but is used in exactly one throwaway spot). Every product grid across all 4 apps downloads full-size phone-camera photos to render a 150px thumbnail.
3. **FE-B1/B2/B3 — The 5 portal auth/entry screens aren't lazy-loaded**, so a `manualChunks` config accident drags MUI (83KB), Recharts (407KB), a 63KB `tesseract.js` OCR wrapper (delivery-only), and ~302KB of inlined Lottie JSON into the **one bundle every user of every portal downloads before anything renders.**
4. **BE-D2 — Admin's Customer Management page joins every customer against their entire order history before paginating**, on every single page load, uncached. Likely the single biggest admin-portal slowdown.
5. **FE-R5 — No shared fetch cache.** 389 direct, uncached API calls across 114 files vs. 4 files using the one cache utility that exists. Navigating back to a page you were just on re-fetches everything from a blank loading state, across admin/seller/delivery especially.
6. **BE-D1 — A live index-creation bug**: an index manager indexes a phantom `customers` collection (the real collection is `users`, from a Mongoose model name mismatch) on every server boot — the intended index on the real, hot Users collection is never created.
7. **BE-I2/I3 — Two customer-facing, hit-on-every-session endpoints** (`GET /seller/nearby`, `GET /offers` — home screen banners) have **zero caching**, despite the app's cache service already having a ready-made, unused TTL defined for exactly the first one.
8. **BE-D6 — DB connection pool capped at 10** (Mongoose's own default is 100) for one Node process serving all 4 apps simultaneously — a handful of concurrent dashboard loads can queue everyone else's requests behind them.
9. **FE-R1/R2 — Two concrete React re-render bugs**: an unconditional 100ms timer re-rendering a live map for the entire time a customer has order tracking open, and a non-memoized context value re-rendering the seller/admin Orders table once a second while the new-order popup is open.
10. **BE-D5 — The delivery app's "available orders" feed** (polled repeatedly by every online rider) makes up to 6 sequential DB round-trips where most are independent and could run in parallel.

## Phase summary

| Phase | Goal | Risk | Behavior change? |
|---|---|---|---|
| 0 | Baseline measurement (before touching anything) | None | No |
| 1 | Cache two hot, uncached read endpoints | Low | No |
| 2 | Fix dead/misnamed DB indexes | Low | No (index-only) |
| 3 | Lazy-load the 5 non-split entry pages + defer heavy libs | Low | No (visual output identical, just deferred) |
| 4 | Fix `manualChunks` vendor-chunk cross-contamination | Low-Medium | No, but needs full smoke test across all 4 portals |
| 5 | Fix 2 concrete React re-render bugs + context granularity | Low-Medium | No — one sub-item needs a quick confirm from you (see Part 2 §5.1) |
| 6 | Add image resizing at serve time + on new uploads | Medium | No (additive query params only; nothing stored changes) |
| 7 | Restructure the 4 slowest backend queries | Medium | No — each ticket's acceptance criteria requires identical response shape |
| 8 | Adopt a shared frontend data cache, page-by-page | Medium-High | No, but largest-effort item — do last, incrementally |
| 9 | Remaining polish (virtualization, image lazy-load pass, cache headers, pool sizing, etc.) | Low | No |
| 10 | Hosting region migration — **your decision required** | High (infra/ops) | No app-level change, but a real migration project |

## What needs your input before Part 2 can be executed

These are flagged in-line in Part 2 too, but calling them out up front because the plan's priority order depends on your answers:

1. **Region migration (Phase 10).** This is the highest-impact single fix in the entire audit, but it's an infrastructure/business decision (new host or region, migration window, cost), not a code change — do you want this scoped as part of the active plan, or tracked separately?
2. **MongoDB Atlas / Render Redis tier.** None of the five passes could determine your actual Atlas cluster tier or Redis plan from `.env.example` alone (it only reveals a `mongodb+srv://` SRV-style URI, which any tier uses). If you're on a free/shared tier, several findings (esp. BE-D6 connection pool, BE-D2/D3/D4 heavy queries) get materially more severe and time-sensitive. Do you know your current tier?
3. **Phase 5's tracking-animation fix (FE-R1)** needs one clarification on intended behavior before it can be called "no behavior change" — see Part 2 §5.1.
