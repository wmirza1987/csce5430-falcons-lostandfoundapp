# Deliverable 5 — Phase 3 Audit and Implementation Changes

**Team:** Falcons · CSCE 5430, Software Engineering, Fall 2026, University of North Texas

**Scope:** Deliverable 5 / Phase 3 — Communication, Moderation, Map, and Analytics

**Baseline audited:** remote `main` at `960a67c` (2026-11-10). The local `deliverable-4` checkout was stale at `25e71ee`; remote `deliverable-4` was at `909d675`. Both remote branches were downloaded and compared: their `src/` trees are identical, so syncing from `main` captured all current code plus the Deliverable 4 inspection and meeting records.

---

## 1. Executive summary

Deliverable 2 §9.3 defines the Phase 3 increment: the approved-claim messaging thread with a 15-second polling limit and report-gated moderator access, a campus map with a list alternative, report review with hide/restore, moderator/category administration, audit logging, and aggregate analytics.

The audit found that the baseline already contained the Phase 2 messaging thread (`Message.js`, `messagingService.js`, `Messaging.jsx`) but **no** reporting, moderation queue, audit log, admin controls, analytics endpoint, or campus map. It also found one functional contradiction with a Must requirement: moderators could read **every** conversation unconditionally (`UT-MSG-09`), which conflicts with FR-COM-02's "only while reviewing a report" restriction.

All Phase 3 gaps were implemented. The backend now has 9 suites / 113 passing tests, and the React client builds successfully with Leaflet/OpenStreetMap. No private content (emails, passwords, claim evidence, message bodies, or listing private details) is written to audit records or returned by aggregate/map endpoints.

---

## 2. Audit method and evidence

| Activity | Evidence |
|---|---|
| Requirement source | Deliverable 2 §5 (FR table), §6 (NFR tables), §7 (interfaces), §9.3 (Phase 3 scope) |
| Baseline comparison | Public GitHub tarballs of `deliverable-4` and `main`; `diff -qr` confirmed identical `src/` trees |
| Code inspection record | `reports/deliverable-4/D4 Item 07 Code Inspection Feedback.docx` (real workshop feedback; no content invented) |
| Code review | Direct inspection of models, services, controllers, routes, and React pages |
| Backend verification | `pnpm exec jest --runInBand` — 9 suites, 113 tests passed |
| Frontend verification | `pnpm build` — 69 modules transformed, build succeeded; `pnpm exec oxlint src` — 0 errors |
| Privacy check | New assertions that audit JSON and aggregate/map JSON contain no private strings |

`git fetch` repeatedly hung in this environment, so branch comparison used the public codeload tarball endpoint instead. No meeting minutes or inspection feedback were fabricated; the only feedback cited is the actual Deliverable 4 document listed above.

---

## 3. Requirement-by-requirement audit

| Requirement | Priority | Baseline status | Action taken | Final status |
|---|---|---|---|---|
| FR-COM-02 — approved-claim private thread | Must | Implemented (Phase 2) | Kept; added hidden-message filtering and placeholder rendering | Met |
| FR-COM-02 — 15-second polling limit, manual refresh | Must | **Missing** (no polling guard) | Added guarded 15 s interval + manual Refresh button in `Messaging.jsx` | Met |
| FR-COM-02 — report-gated moderator access + audit | Must | **Violated** (moderator read all threads) | Added `assertThreadAccess`; thread list/read/flag require open/reviewing report; access audit logged | Met |
| FR-SRCH-03 — campus map by building/zone/pin | Should | **Missing** | Added coarse campus building catalog, `/map/*` API, Leaflet + OSM client, and list view | Met |
| FR-SRCH-03 — no live/precise location | Should | N/A | Catalog coordinates rounded to 3 decimals (~100 m); unknown buildings are listed but never plotted | Met |
| FR-ADM-01 — report listing/message | Should | **Missing** | Added `Report` model, report API, report buttons on listing detail and messages | Met |
| FR-ADM-01 — hide/restore with recorded reason | Should | **Missing** | Added moderation decisions that soft-hide/restore content and require a reason | Met |
| FR-ADM-02 — manage moderator accounts and categories | Should | **Missing** | Added admin-only user role/active endpoints and category catalog endpoints | Met |
| FR-ADM-02 — audit every role change and moderation action | Should | **Missing** | Added `AuditLog` + `auditService`; all privileged paths record non-content events | Met |
| FR-ADM-03 — aggregate dashboard, no private content | Should | **Missing** | Added `/admin/analytics` and admin dashboard UI; selects only non-private fields | Met |
| IF-SW-04 — Leaflet + OSM with attribution | Interface | **Missing** | Added `leaflet@^1.9.4`, OSM tiles, attribution text in API and UI | Met |
| IF-COM-03 — REST polling ≤ 1/15 s, no sockets | Interface | **Missing** | Implemented in messaging client | Met |
| NFR-PRIV-01 — no private content in logs/responses | Must | Partially met | Added field-level `select: false`, hidden filtering, and privacy assertions | Met |
| NFR-REL-01 — confirm DB write before success | Must | Already met | Preserved; report/moderation writes awaited before responses | Met |
| NFR-ACC-01 / NFR-COMP-01 — accessible, responsive | Must/Should | Partially met | Added labelled controls, `aria-live`, focus styles, and responsive breakpoints | Met (build/static review) |

### Deferred / not fully exercised

- **Cross-browser runs (NFR-COMP-01):** only a production build and static review were executed here; no Chrome/Edge/Firefox/Safari session was available in this environment.
- **Seven-day availability test (NFR-REL-02):** not run; this audit covers code and automated tests only.
- **Automated retention/purge job (NFR-PRIV-02):** not implemented. The real Deliverable 4 inspection feedback explicitly deferred the soft-delete retention policy to Deliverable 5; this release documents the policy and implements restorable soft-hiding, but does not add a scheduled purge worker.

---

## 4. Changes made — backend

### 4.1 New files

| File | Purpose |
|---|---|
| `models/AuditLog.js` | Non-content audit records: actor, action, target type/id, short detail, timestamp; indexes on actor/action/date |
| `models/Report.js` | Report target, derived listing/claim links, reason, status, decision, handler, and `threadAccessAt` |
| `models/Category.js` | Admin-managed category catalog with uniqueness, activation flag, and creator |
| `services/auditService.js` | Central `recordAudit()` with sanitised detail (line breaks collapsed, 300-char cap) and action constants |
| `services/reportService.js` | Report creation, queue retrieval, `assertThreadAccess`, review start, and hide/restore/dismiss decisions |
| `services/campusService.js` | Static catalog of 18 coarse UNT building coordinates (±3 decimals), zone list, name normalisation |
| `services/analyticsService.js` | Aggregate listing counts, resolution rate, average resolution days, common categories, hotspots, report summary |
| `services/adminService.js` | Role/active management, category CRUD, and audit retrieval; protects the admin role from assignment/removal |
| `controllers/reportController.js`, `routes/reportRoutes.js` | Report API with rate limiting; moderator-only queue and decisions |
| `controllers/adminController.js`, `routes/adminRoutes.js` | Admin API; `router.use("/admin", protect, authorizeRoles("admin"))` scoped to the `/admin` prefix |
| `controllers/mapController.js`, `routes/mapRoutes.js` | Public building catalog and listing pins with building/zone/type filters and list view |
| `tests/deliverable5.test.js` | 14 new tests across reporting, moderation, administration, audit privacy, analytics, and map |

### 4.2 Modified files

| File | Change |
|---|---|
| `models/Listing.js` | Added `isHidden` (indexed), hidden reason/by/at with `select: false`; compound index now includes `isHidden` |
| `models/Message.js` | Added `isHidden` (indexed) and hidden metadata with `select: false` |
| `services/messagingService.js` | Moderator roles now resolve through `assertThreadAccess`; hidden messages excluded for participants and shown as `[hidden by moderation]` to reviewers; thread listing for moderators limited to reported threads; flagging audit logged |
| `controllers/listingController.js` | Public browse/search excludes `isHidden`; detail returns 404 for hidden listings unless the requester is the owner |
| `app.js` | Mounted report, admin, and map routers under the versioned and compatibility APIs |
| `tests/messaging.test.js` | Replaced the contradictory "moderator can read every conversation" test with two report-gated access tests; flag test now creates a report first |

### 4.3 Notable implementation decisions

- **Soft hide, not deletion.** Hidden listings/messages remain in MongoDB so a moderator can restore them and an audit record can reference them.
- **Report links carry the thread.** A message report copies the message's `claim`/`listing` onto the report, so `assertThreadAccess` can authorize without a second document lookup. Opening a thread moves an open report to `reviewing` and records both events. Resolving the report ends thread access (`threadAccessAt` cleared, status `resolved`).
- **Admin role is not assignable.** The role endpoint accepts only `user`/`moderator` and refuses changes to admin accounts, preventing both escalation and accidental loss of the last administrator.
- **Scope-safe admin middleware.** The first implementation used `router.use(protect, ...)` without a path, which unintentionally guarded routers mounted later (the map API returned 401). It was corrected to `router.use("/admin", ...)` and covered by tests.
- **Analytics selects only non-private fields** (`status`, `type`, `category`, `location`, `isHidden`, timestamps); claims, messages, and private details are never queried.

---

## 5. Changes made — frontend

| File | Change |
|---|---|
| `package.json` / `pnpm-lock.yaml` | Added `leaflet@^1.9.4` |
| `pages/CampusMap.jsx` | New page: Leaflet map with OSM tiles + attribution, building/zone/type filters, equivalent list view, and coarse-pin rendering |
| `pages/Moderation.jsx` | New page: report queue with status filter and hide/restore/dismiss actions requiring a recorded reason |
| `pages/AdminDashboard.jsx` | New page: aggregate analytics, moderator account controls, category management, and non-content audit log |
| `components/RoleRoute.jsx` | New client-side role guard; the API independently enforces the same roles |
| `pages/Messaging.jsx` | Added 15-second guarded polling, manual Refresh button, message report button, hidden-message badge, and placeholder rendering |
| `pages/ListingDetail.jsx` | Added "Report listing" button for signed-in non-owners |
| `components/Navbar.jsx` | Added Campus map link, plus role-conditional Moderation and Admin links |
| `App.jsx` | Added `/map`, `/moderation`, and `/admin` routes with appropriate guards |
| `App.css` | Leaflet container sizing, map/moderation/admin layout, focus-friendly controls, and mobile breakpoints |

### Polling detail

`loadMessages()` checks `Date.now() - lastFetchRef.current` against 15,000 ms before any poll or manual refresh. The automatic interval and manual refresh share the guard; immediate refreshes after sending, flagging, or paging pass `force: true` because they are direct user actions rather than polling. A message informs the user when a refresh was throttled.

---

## 6. Verification results

```
Backend:  pnpm exec jest --runInBand
          Test Suites: 9 passed, 9 total
          Tests:       113 passed, 113 total

Frontend: pnpm build
          ✓ 69 modules transformed, build succeeded

          pnpm exec oxlint src
          0 errors (warnings are pre-existing unused catch parameters)
```

New test coverage includes:

- report creation, validation, duplicate protection, and moderator-only queue access;
- hide → exclusion from browse, detail, and map → restore → reappearance;
- hidden-message placeholder for both participants and reviewing moderators;
- admin-only access to all `/admin` endpoints, role change auditing, admin-role protection;
- category CRUD/deactivation and audit records free of emails, passwords, message bodies, and reasons;
- aggregate counts with hidden listings excluded and no private details in responses;
- coarse coordinate format, known vs. unknown building plotting, zone filtering, and list view;
- revised messaging tests proving a moderator is denied without a report and admitted with one.

---

## 7. Privacy and security review

| Check | Result |
|---|---|
| Audit detail sanitised on write | Yes — newlines collapsed, 300-char cap; only IDs, action names, and short reasons |
| Message bodies in audit/analytics/map responses | None; assertions added |
| Emails/passwords in audit responses | None; assertion added |
| Claim evidence queried by analytics | Never — only listing fields are selected |
| Private listing details in public search/map | Never returned; hidden detail fields remain `select: false` |
| Hidden listings/messages | Excluded from public views; restorable by moderators |
| Moderator thread access | Requires open/reviewing linked report; every access audit logged |
| Role escalation | Admin role unassignable through the API |

---

## 8. Team and contribution record

Names and IDs are taken from `GROUP-INFO`; role areas are carried forward from the team roster in `README.md` and the Deliverable 4 report's member contribution table (§9). The Phase 3 code in this checkout was produced in the current working session by the coding assistant, so this table records each member's established ownership area rather than claiming new per-person Deliverable 5 task assignments.

| Member | ID | Responsibility area |
|---|---|---|
| Waleed Mirza (Team Leader) | 1194980 | Project management, requirements, coordination, demo |
| Venkata Sai Anirudh Naidu Mamidi | 11908399 | Backend models, services, controllers, routes, configuration |
| Sai Sathvika Potluri | 11813771 | Design, documentation, UML/diagrams, review |
| Sai Asritha Thati | 11909319 | Frontend implementation, test cases, test execution |

---

## 9. Files delivered in this change set

**New backend:** `AuditLog.js`, `Report.js`, `Category.js`, `auditService.js`, `reportService.js`, `campusService.js`, `analyticsService.js`, `adminService.js`, `reportController.js`, `adminController.js`, `mapController.js`, `reportRoutes.js`, `adminRoutes.js`, `mapRoutes.js`, `tests/deliverable5.test.js`.

**Modified backend:** `Listing.js`, `Message.js`, `messagingService.js`, `listingController.js`, `app.js`, `tests/messaging.test.js`.

**New frontend:** `CampusMap.jsx`, `Moderation.jsx`, `AdminDashboard.jsx`, `RoleRoute.jsx`.

**Modified frontend:** `Messaging.jsx`, `ListingDetail.jsx`, `Navbar.jsx`, `App.jsx`, `App.css`, `package.json`, `pnpm-lock.yaml`.

**Documentation:** this report, plus `README.md` updates (Phase 3 API table, test counts, Deliverable 5 link).

> Note: the working tree also contains Phase 2 files synced from remote `main` (messaging, evidence crypto, claims/tests) that were missing from the stale local checkout. Those are baseline restoration, not new Deliverable 5 work.

---

## 10. How to verify locally

```bash
# backend (MongoDB must be reachable; uses MONGODB_URI_TEST)
cd src/backend
pnpm exec jest --runInBand

# frontend
cd src/frontend
pnpm build
pnpm exec oxlint src
```

To exercise the workflow in the UI: sign in → open a listing → **Report listing** → sign in as a moderator → **Moderation** → open the linked conversation → hide/restore with a reason → sign in as an administrator → **Admin** to review analytics, roles, categories, and the audit log. The **Campus map** link is public and offers both map and list views.
