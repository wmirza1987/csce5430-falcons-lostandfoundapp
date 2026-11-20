---
title: "APIs Used in the Lost and Found for Campus Project"
subtitle: "Deliverables 1–4 · CSCE 5430 (Fall 2026) · Team Falcons"
---

**Team Falcons** — Waleed Mirza (1194980) · Venkata Sai Anirudh Naidu Mamidi (11908399) · Sai Sathvika Potluri (11813771) · Sai Asritha Thati (11909319)

*Prepared from the source in `src/backend` and `src/frontend`, and from the Deliverable 1, 2, and 4 documents.*

# 1. Purpose and scope

This document explains every API the project uses, why each one was chosen, and where it is implemented in the code. It covers the whole sequence from Deliverable 1, where the stack and external services were proposed, through Deliverable 4, where Phase 2 was implemented and tested.

"API" is used here in three senses, because the project depends on all three:

1. **The REST API we expose.** Express routes under `/api/v1` that the React client calls. This is the largest part of the document.
2. **External service interfaces we call.** MongoDB through Mongoose, and an SMTP mail provider through Nodemailer.
3. **Browser platform APIs we build on.** `fetch`, `FormData`/`File`, and `localStorage`, which replace a third-party HTTP client or storage library.

**Table 1. APIs and integrations at a glance.**

| Layer | Interface | Direction | Introduced | Implementation |
|------------|--------------------|--------------|-----------------|-------------------------------------|
| Client → server | REST/JSON over HTTP, `/api/v1` | Outbound from React | Phase 1, versioned in Phase 2 | `config/api.js`, `pages/*.jsx` |
| Server → database | MongoDB driver via Mongoose | Outbound from Express | Phase 1 | `config/db.js`, `models/*.js` |
| Server → email | Authenticated SMTP via Nodemailer | Outbound from Express | Phase 1, extended in Phase 2 | `services/emailService.js` |
| Server → client | Static files under `/uploads` | Inbound to Express | Phase 1 | `app.js`, `uploadMiddleware.js` |
| Client–server auth | JWT Bearer credential | Both directions | Phase 1 | `authMiddleware.js`, `authController.js` |
| Client platform | `fetch`, `FormData`, `localStorage` | Browser | Phase 1 | `pages/*.jsx`, `components/*.jsx` |

Two things are deliberately absent and are discussed in Section 8: the Leaflet/OpenStreetMap map, which is Phase 3 work and has no code yet, and any real-time socket transport, which the Deliverable 2 interface requirements explicitly rule out.

# 2. What the requirements fixed before any code

The API choices were not made ad hoc. Deliverable 1 set the stack and the free-tier constraint; Deliverable 2 turned that into numbered interface requirements.

**Table 2. Constraints inherited from Deliverable 1.**

| Decision | Stated in D1 | Effect on the API |
|----------------------|----------------------------------|--------------------------------------------|
| MERN architecture | React client, Node.js/Express REST API, MongoDB | One server-side API owns all business logic and data access |
| MongoDB Atlas free tier | Chosen as the development database | Connection is a single `MONGODB_URI`; no vendor SDK beyond Mongoose |
| Nodemailer or comparable | Transactional email, with Mailtrap or Ethereal as fallbacks | SMTP is configured through environment variables, so any provider works |
| Leaflet + OpenStreetMap | Map view without a paid key | Deferred; no map API is called in Deliverables 1–4 (FR-SRCH-03 is Phase 3) |
| Render or Vercel free tier | Deployment target for demonstration | API base URL is environment-driven, not hard-coded |
| No paid third-party APIs | Cost constraint for the course | Auth, matching, uploads, and notifications are all implemented in-house |

**Table 3. Interface requirements from Deliverable 2, Section 7.**

| ID | Requirement (abridged) | How the code answers it |
|----------|--------------------------------------------|----------------------------------------------|
| IF-SW-01 | React calls **versioned** Express REST endpoints and exchanges JSON, except uploads | Routes mounted at `/api/v1`; JSON bodies; `multipart/form-data` only for images |
| IF-SW-02 | Uploads use multipart form data and are validated before a file reference is stored | Multer disk storage with MIME, size, and count limits; URLs written to the listing afterwards |
| IF-SW-03 | The API is the **only** component that reads or writes MongoDB | No database driver exists in the frontend; all queries are in controllers/services |
| IF-COM-01 | HTTPS with JSON bodies and documented HTTP status codes | JSON everywhere; explicit `200/201/400/401/403/404/409/429/500` per endpoint |
| IF-COM-02 | Protected requests carry the session credential; missing/expired/unauthorized is rejected | `Authorization: Bearer <JWT>` enforced by `protect`; `401` on failure |
| IF-COM-03 | Email uses an **authenticated provider**; updates by REST polling no more often than every 15 s, no socket | Nodemailer SMTP with user/password; notifications loaded by REST on navigation, no socket |
| IF-UI-03 | Claim review separates public listing data from private evidence | `privateDetails` selected explicitly and stripped from non-owner responses |

# 3. The REST API we expose

## 3.1 Shared conventions

All application routes are defined once on an Express router and mounted twice in `app.js`:

```javascript
// src/backend/app.js
const apiRouter = express.Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/listings", listingRoutes);
apiRouter.use(matchRoutes);
apiRouter.use(claimRoutes);
apiRouter.use(notificationRoutes);

// Versioned API (IF-SW-01); the unversioned mount is kept as a
// compatibility alias for existing clients and tests.
app.use("/api/v1", apiRouter);
app.use("/api", apiRouter);
```

`/api/v1` is the canonical prefix because IF-SW-01 requires versioned endpoints. `/api` remains a working alias so Phase 1 clients and tests were not broken by the versioning change.

The conventions below apply to every route:

- **Bodies and responses are JSON**, except `POST`/`PUT /listings`, which accept `multipart/form-data` for images. JSON bodies are capped at 1 MB (`express.json({ limit: "1mb" })`).
- **Authentication** is a signed JWT in the `Authorization: Bearer <token>` header. It carries `{ userId }` and expires after **1 hour**. `protect` verifies the signature, reloads the user, and rejects a missing, malformed, expired, or deactivated account with `401`.
- **Anonymous access is explicit.** Only the routes marked *Public* below skip `protect`. `GET /listings/:id` uses `optionalAuth`, which never rejects a request but attaches `req.user` when a valid token is present, so an owner sees their own private details.
- **Errors are uniform JSON.** The terminal handler returns `404 {message: "Route not found."}` for unknown routes, `400` for malformed JSON, and `500` for unhandled errors; controllers return a specific message and status.
- **Rate limiting** applies to authentication and claim submission: a fixed window of 30 requests per 15 minutes per IP/account. Exceeding it returns `429` with a `Retry-After` header.
- **CORS is an allowlist.** `CLIENT_ORIGIN` is a comma-separated list; requests with no `Origin` (curl, tests) are allowed; any other origin gets `403 {"message":"Origin is not allowed."}`.

**Table 4. Status codes used across the API.**

| Code | Meaning in this API | Example |
|---------|---------------------------------|----------------------------------------------------------|
| 200 | Successful read or update | `GET /listings`, `PATCH /claims/:id/decision` |
| 201 | Resource created | `POST /auth/register`, `POST /listings`, `POST /listings/:id/claims` |
| 400 | Malformed request or failed validation | Bad date range, missing explanation, invalid id |
| 401 | Missing, invalid, or expired credential | No `Authorization` header on a protected route |
| 403 | Authenticated but not allowed | Non-owner editing a listing, unverified email |
| 404 | Resource not found or soft-deleted | Unknown listing, claim, or notification |
| 409 | State conflict | Duplicate claim, editing a non-active listing, double approval |
| 429 | Rate limit exceeded | More than 30 auth or claim requests in 15 minutes |
| 500 | Unexpected server failure | Database or mail transport error |

## 3.2 Authentication and account endpoints

**Table 5. `/api/v1/auth` endpoints.**

| Method | Path | Auth | Purpose | Success | Errors |
|-------------|---------------------|-----------|-------------------------|---------------|---------------|
| POST | `/auth/register` | Public, rate-limited | Create an account and send a verification link | 201 + user summary | 400 missing fields, 409 duplicate email |
| GET | `/auth/verify-email/:token` | Public | Mark the account verified from the emailed token | 200 | 400 invalid or expired token |
| POST | `/auth/login` | Public, rate-limited | Exchange email/password for a JWT | 200 + `token` + user | 400 missing, 401 bad credentials |
| POST | `/auth/forgot-password` | Public, rate-limited | Send a time-limited reset link | 200 (always neutral) | 400 missing email |
| POST | `/auth/reset-password/:token` | Public, rate-limited | Set a new password from the token | 200 | 400 short password or invalid token |
| GET | `/auth/profile` | JWT | Return the signed-in user's summary | 200 + user | 401 |
| PATCH | `/auth/preferences` | JWT | Toggle optional email notifications | 200 + setting | 400 non-boolean, 401 |
| GET | `/auth/admin-test` | JWT + admin role | Prove role enforcement end to end | 200 | 401, 403 |

The session credential is issued in one place:

```javascript
// src/backend/controllers/authController.js
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};
```

and checked in one place:

```javascript
// src/backend/middleware/authMiddleware.js
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const user = await User.findById(decoded.userId);

if (!user || !user.isActive) {
  return res.status(401).json({ message: "User account is not available." });
}
```

Three details are worth explaining because they are security decisions, not boilerplate:

- **A JWT rather than a server session.** IF-COM-02 only requires an authenticated credential. A signed token needs no session store, which suits a single free-tier instance, and the 1-hour expiry bounds the damage if one leaks.
- **Passwords are hashed with bcrypt** in a `pre("save")` hook, and `password` is `select: false`, so it is absent unless a query explicitly asks for it.
- **Emailed tokens are stored as SHA-256 hashes, not plaintext.** `generateEmailVerificationToken` and `generatePasswordResetToken` return a raw token for the link and persist only `hashToken(rawToken)`, so a database read cannot recover a working link. Verification and reset query by hash and expiry.
- **Forgot-password never reveals whether an account exists.** It returns the same `200` message either way, which closes an account-enumeration channel.

Registration does not fail if the verification email cannot be sent; the error is logged and the account still exists, so a mail outage does not lose a signup. Listing creation and claim submission separately require `isEmailVerified`, which is how FR-AUTH-01 is enforced.

## 3.3 Listing and upload endpoints

**Table 6. `/api/v1/listings` endpoints.**

| Method | Path | Auth | Purpose | Success | Errors |
|-------------|-------------------|-------------|---------------------------|-------------|---------------|
| GET | `/listings` | Public | Browse, search, filter, paginate Active listings | 200 + page envelope | 400 bad date or type |
| GET | `/listings/:id` | Optional JWT | Fetch one listing; private details only for its owner | 200 + listing | 400 invalid id, 404 |
| POST | `/listings` | JWT + verified email | Create a Lost or Found listing, optionally with images | 201 + listing | 400 validation, 403 unverified |
| PUT | `/listings/:id` | JWT, owner | Edit fields and replace images on an Active listing | 200 + listing | 400, 403, 404, 409 not active |
| DELETE | `/listings/:id` | JWT, owner | Soft-delete an Active listing | 200 | 403, 404, 409, 500 |

The search endpoint is the most parameterised part of the API:

**Table 7. `GET /api/v1/listings` query parameters.**

| Parameter | Type | Behaviour |
|------------------------|----------------|------------------------------------------------------------|
| `search` | string | Case-insensitive regex over title, description, category, brand, color |
| `type` | `lost` \| `found` | Rejected with `400` if it is neither |
| `category`, `brand`, `color` | string | Anchored, case-insensitive exact match; regex characters escaped |
| `building`, `zone` | string | Match `location.building` / `location.zone` |
| `startDate`, `endDate` | date | Inclusive range on `date`; rejected if invalid or reversed |
| `page` | integer | Default 1 |
| `limit` | integer | Default and maximum 20 (`MAX_PAGE_SIZE`) |

The response is a page envelope rather than a bare array, so the client can render pagination without a second request:

```javascript
// src/backend/controllers/listingController.js
const query = { isDeleted: false, status: "active" };

const total = await Listing.countDocuments(query);
const listings = await Listing.find(query)
  .populate("createdBy", "firstName lastName")
  .sort({ createdAt: -1 })
  .skip((pageNumber - 1) * pageSize)
  .limit(pageSize);

return res.status(200).json({
  total, page: pageNumber, limit: pageSize,
  totalPages: Math.ceil(total / pageSize), listings,
});
```

Only `active`, non-deleted listings are searchable, which is what makes "resolved" and "pending return" items disappear from browse without deleting history. `privateDetails` is `select: false` on the model and is explicitly selected only in `getListingById`/`updateListing`, then deleted from the response when the caller is not the owner. That is the direct implementation of IF-UI-03 and NFR-PRIV-01.

Image upload is handled by Multer before the controller runs:

```javascript
// src/backend/middleware/uploadMiddleware.js
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 3;

const uploadListingImages = multer({
  storage, fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES },
}).array("images", MAX_FILES);
```

Multer errors are converted into normal `400` JSON responses (wrong type, over 5 MB, more than three files, unexpected field), so a bad upload never surfaces as an uncaught exception. Files are stored under `uploads/listings/` with a timestamp-plus-random name, and the controller saves only the public URL (`/uploads/listings/<file>`). `app.js` serves that directory with `express.static`, which keeps local development on the free tier and avoids a paid object-storage dependency.

## 3.4 Matching endpoints

**Table 8. `/api/v1` matching endpoints.**

| Method | Path | Auth | Purpose | Success | Errors |
|-------------|-------------------|-----------|-----------------------------|-------------|---------------|
| GET | `/listings/:id/matches` | JWT, owner | Suggestions for one of the caller's listings | 200 + matches sorted by score | 400 invalid id, 403 not owner, 404 |
| GET | `/matches` | JWT | Suggestions across all of the caller's listings | 200 + matches | 401, 500 |

These are read-only. Matches are produced as a side effect of listing create, update, and restore in `matchingService.js`, not by a client call, so a client cannot ask the server to recompute arbitrary pairs. Both endpoints are owner-only because a match reveals that two users' items are related; `403` is returned rather than filtering the list, which makes the rule explicit.

Each `Match` document stores `score` and the four contributing factors (category, date, location, keywords), so the UI can explain *why* a pair was suggested. Pairs below 65 points are not stored, and stale pairs are deleted on edit or deletion rather than appended.

## 3.5 Claim and resolution endpoints

**Table 9. `/api/v1` claim endpoints.**

| Method | Path | Auth | Purpose | Success | Errors |
|-------------|----------------------|-----------|-------------------------|-------------|----------------|
| POST | `/listings/:id/claims` | JWT, verified, rate-limited | Submit a claim with evidence | 201 + claim (no private details) | 400, 403 unverified/owner, 404, 409 |
| GET | `/listings/:id/claims` | JWT, owner | Read all claims and evidence for a listing | 200 + claims | 400, 403, 404 |
| GET | `/claims/mine` | JWT | Claims the caller submitted | 200 + claims | 401, 500 |
| GET | `/claims/:id` | JWT, claimant or owner | Read one claim | 200 + claim | 400, 403, 404 |
| PATCH | `/claims/:id/decision` | JWT, owner, rate-limited | Approve or reject a pending claim | 200 + claim | 400 action, 403, 404, 409 |
| PATCH | `/listings/:id/resolve` | JWT, owner | Mark a Pending Return listing Resolved | 200 + listing | 400, 403, 404, 409 |

Claim submission validates, in order: the account is email-verified (`403`), the listing exists (`404`), it is a Found listing (`400`), it is still accepting claims (`409`), the caller is not the owner (`403`), the explanation is non-empty (`400`), at least two private identifying details are present (`400`), and no active duplicate claim exists (`409`). The `201` response deliberately omits `privateDetails`; only the owner's `GET /listings/:id/claims` returns them.

Approval is the one place where two requests could corrupt state, so it uses a conditional update rather than a read-then-write:

```javascript
// src/backend/controllers/claimController.js
const updatedListing = await Listing.findOneAndUpdate(
  { _id: listing._id, status: "active", isDeleted: false },
  { $set: { status: "pending_return" } },
  { new: true }
);

if (!updatedListing) {
  return res.status(409).json({
    message: "This listing is no longer available for claim approval.",
  });
}
```

If two approvals race, only the first matches `status: "active"`; the second gets `409`. After that, the chosen claim becomes `approved`, every competing pending claim becomes `closed` with an explanatory note, matches are removed, and affected users are notified. Resolution requires the owner, a `pending_return` listing, and an existing approved claim (`409` otherwise).

## 3.6 Notification endpoints

**Table 10. `/api/v1/notifications` endpoints.**

| Method | Path | Auth | Purpose | Success | Errors |
|-------------|--------------------|-----------|--------------------------|-------------|-----------------|
| GET | `/notifications` | JWT | List notifications with unread count | 200 + list, count | 401, 500 |
| PATCH | `/notifications/read-all` | JWT | Mark every notification read | 200 + count | 401, 500 |
| PATCH | `/notifications/:id/read` | JWT | Mark one notification read | 200 + record | 400 invalid id, 404 |

`GET /notifications` accepts `unreadOnly=true` and `limit` as optional query parameters. Ownership is enforced in the service layer: the query always includes `user: req.user._id`, and marking read returns `404` rather than `403` for someone else's id, so the endpoint does not confirm that another user's notification exists.

Notifications are written by `notificationService.js` for five events: a potential match, a new claim, a decision, a competing claim closed, and a resolution. Each is persisted first; email is an optional second step. The service records `emailStatus` (`sent`, `skipped`, `failed`) and `emailAttempts`, and every call site wraps it so a mail failure is logged and swallowed. That is the implementation of FR-COM-01's rule that a failed email must never reverse a claim, decision, or listing change.

## 3.7 Health and compatibility endpoints

`GET /api/v1/health` (and its alias `GET /api/health`) returns `200 {"status":"ok","message":"Team Falcons backend app is running"}` without touching the database. It exists so a deployment platform or a grader can confirm the process is up before exercising authenticated routes.

# 4. External service interfaces

## 4.1 MongoDB through Mongoose

MongoDB is the only persistent store. `config/db.js` makes exactly one connection from `MONGODB_URI` and exits the process if it fails, so the API never runs in a half-connected state:

```javascript
// src/backend/config/db.js
const connection = await mongoose.connect(process.env.MONGODB_URI);
console.log(
  `MongoDB connected: ${connection.connection.host}/${connection.connection.name}`
);
```

Five models own the schema: `User`, `Listing`, `Match`, `Claim`, and `Notification`. Mongoose was chosen over the raw driver because the project needs schema validation, `select: false` for private fields, population of owner names, and compound uniqueness rules (for example one active claim per claimant per listing). The free Atlas tier from Deliverable 1 is used for development, with `MONGODB_URI_TEST` pointing at a separate database so the Jest suites never touch development data.

This arrangement is what satisfies IF-SW-03: there is no Mongo client in `src/frontend`, and the React code can only reach data through the REST API.

## 4.2 SMTP through Nodemailer

Email is sent through an authenticated SMTP account, as IF-COM-03 requires. The transport is built entirely from environment variables, so the same code works with a free SMTP account, Mailtrap, or Ethereal — the fallbacks named in Deliverable 1:

```javascript
// src/backend/services/emailService.js
return nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
```

Three behaviours make the mail interface safe to depend on:

- **Absence is not a crash.** If the four SMTP variables are unset, `sendMail` logs one line with no recipient, subject, body, or link and returns `{ delivered: false, reason: "smtp_not_configured" }`. Local development and grading therefore work without a provider account, and the log itself cannot leak a verification token.
- **Notification mail is retried once**, then recorded as `failed`; the calling action has already committed and is never rolled back.
- **Verification and reset mail are not retried**, because the user can request another link; the request still returns its normal response.

`SMTP_FROM` defaults to `no-reply@lostandfound.unt.edu`, and `APP_BASE_URL` builds the verification and reset links so the same code works locally and on a deployed host.

## 4.3 Browser platform APIs

The client uses no HTTP library. `config/api.js` is the single source of the backend origin:

```javascript
// src/frontend/src/config/api.js
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
```

Every request is native `fetch` with an explicit method, `Content-Type` where needed, and `Authorization: Bearer <token>` when the user is signed in. Compared with adding Axios, this keeps the dependency surface small and makes it obvious at each call site which endpoint and credential are used. `VITE_API_BASE_URL` is deliberately environment-driven so the Render/Vercel split from Deliverable 1 needs no code change.

Two other browser APIs matter:

- **`FormData` and `File`** build the multipart body for listing images. The browser sets the multipart boundary, which is why the client must not set `Content-Type` manually for those requests.
- **`localStorage`** holds the JWT and a small user summary after login, and is cleared on logout. It is read by `ProtectedRoute` and by each page that calls a protected endpoint. This is a deliberate course-project trade-off: it is simple and survives reloads, but it is readable by any script on the origin, so a production system would prefer an `HttpOnly` cookie.

## 4.4 Static file delivery and CORS

Uploaded images are served by Express from `/uploads`, not by a third-party CDN. The listing stores a relative URL, the client prefixes it with `API_BASE_URL`, and no signed-URL or bucket policy is needed. On a free single-instance deployment this is the lowest-cost option, and it keeps image access behind the same origin policy as the API.

CORS is part of the interface contract, not an afterthought. The allowlist comes from `CLIENT_ORIGIN` (comma-separated), so the Vite dev server and the deployed frontend can both be permitted without allowing arbitrary origins. A rejected origin produces `403` through the terminal error handler, not an HTML stack trace.

# 5. Why these choices

**Table 11. Requirement-to-implementation traceability.**

| Choice | Requirement | Reason | Trade-off accepted |
|---------------------|------------------|------------------------------------|-------------------------|
| Versioned `/api/v1` REST | IF-SW-01, IF-COM-01 | A stable contract the client can rely on; a future breaking change can ship as `/v2` without moving existing screens | One extra path segment; `/api` alias kept for compatibility |
| JSON bodies and explicit status codes | IF-COM-01 | Every outcome is machine-readable and testable; the client branches on status, not on message text | Slightly more verbose controllers |
| JWT Bearer, 1-hour expiry | IF-COM-02, FR-AUTH-02 | Stateless, no session store on a free tier; expiry limits token misuse | No server-side revocation before expiry |
| bcrypt + hashed email tokens | NFR-SEC-02, NFR-PRIV-01 | A database leak does not yield passwords or usable links | Slightly more code in the `User` model |
| Mongoose over the raw driver | IF-SW-03, D1 | Schema validation, field projection, population, and indexes in one place | Couples the data layer to one ODM |
| Multer with MIME/size/count limits | IF-SW-02, FR-LIST-02 | Rejects bad files before any permanent reference exists | Local disk is not shared across instances |
| Authenticated SMTP via Nodemailer | IF-COM-03, D1 | Provider-agnostic, free-tier compatible, and already the D1 plan | Delivery is best-effort, not guaranteed |
| In-app notification first, email second | FR-COM-01 | The durable record cannot be lost by a mail failure | Email is eventually consistent |
| Native `fetch` | IF-SW-01 | No extra dependency; request/credential visible per call | Repetition across pages instead of one client module |
| In-memory rate limiter | NFR-SEC-03 | Dependency-free abuse control for one instance | Counters reset on restart and are not shared |
| CORS allowlist | NFR-SEC-01 | Browser origins other than the deployed client cannot call the API with credentials | Must update `CLIENT_ORIGIN` when the frontend URL changes |
| `express.static` for uploads | D1 cost constraint | No object-storage account or bill | Files live on the instance's disk |

# 6. Implementation map

**Table 12. Where each API concern lives** (backend paths relative to `src/backend/`, frontend paths relative to `src/frontend/src/`).

| File | Responsibility | API surface |
|----------------------------------------|-----------------------------------|--------------------------|
| `app.js` | App assembly, CORS, JSON limit, static uploads, route mounts, health, 404/500 handling | All routes, `/uploads`, `/api/v1/health` |
| `server.js` | Connects the database, then listens on `PORT` | Process entry point |
| `config/db.js` | Single Mongoose connection | MongoDB |
| `routes/authRoutes.js` | Auth paths, rate limiter, `protect`, role guard | `/auth/*` |
| `routes/listingRoutes.js` | Listing paths, optional auth, upload middleware | `/listings/*` |
| `routes/matchRoutes.js` | Owner-only match reads | `/listings/:id/matches`, `/matches` |
| `routes/claimRoutes.js` | Claim submission, review, decision, resolution | `/listings/:id/claims`, `/claims/*`, `/listings/:id/resolve` |
| `routes/notificationRoutes.js` | Notification list and read state | `/notifications/*` |
| `middleware/authMiddleware.js` | JWT verification; `protect` and `optionalAuth` | Every protected or owner-aware route |
| `middleware/roleMiddleware.js` | `authorizeRoles(...)` | `/auth/admin-test` |
| `middleware/rateLimitMiddleware.js` | Fixed-window limiter with `Retry-After` | Auth and claim routes |
| `middleware/uploadMiddleware.js` | Multer storage, MIME/size/count validation, URL mapping | `POST`/`PUT /listings` |
| `controllers/authController.js` | Registration, verification, login, reset, preferences | `/auth/*` |
| `controllers/listingController.js` | Create, search, read, update, soft delete | `/listings/*` |
| `controllers/matchController.js` | Owner-scoped match queries | `/listings/:id/matches`, `/matches` |
| `controllers/claimController.js` | Claim rules, atomic approval, competitor closure, resolution | Claim routes |
| `controllers/notificationController.js` | List, unread count, mark read | `/notifications/*` |
| `services/emailService.js` | SMTP transport, retry, skipped fallback, verification/reset mail | Outbound email |
| `services/notificationService.js` | Persist notifications, call email, record delivery state | Triggered by match/claim events |
| `services/matchingService.js` | Scoring, persistence, refresh/removal, notification trigger | Triggered by listing writes |
| `config/api.js` | `API_BASE_URL` and `apiUrl()` | All client requests |
| `pages/*.jsx` | Calls to the endpoints, bearer header, form bodies | Auth, listings, claims, notifications |

# 7. How the API evolved across the deliverables

**Table 13. API decisions by deliverable.**

| Deliverable | What was decided or built | API consequence |
|------------------|--------------------------------------|--------------------------------------------|
| **D1 — Proposal** | MERN stack; MongoDB Atlas free tier; Nodemailer or comparable; Leaflet + OpenStreetMap; Render/Vercel; no paid services | Fixed the integration set and the free-tier constraint that still governs every choice |
| **D2 — Requirements** | Numbered interface requirements `IF-SW-01…04`, `IF-COM-01…03`, `IF-UI-01…03` | Versioned JSON REST, multipart uploads, single data-access layer, authenticated email, bearer credential, no sockets |
| **D3 — Phase 1** | Authentication, listings, search, uploads, role check | `/api` routes for auth and listings; JWT, Multer, Mongoose, static uploads |
| **D4 — Phase 2** | Matching, claims, resolution, notifications, report | `/api/v1` canonical mount; match, claim, and notification routes; email notification state; rate limiting extended to claims |

Phase 1 deliberately shipped the simpler unversioned `/api` mount. Phase 2 introduced `/api/v1` to satisfy IF-SW-01 and kept `/api` as an alias, so the change added a version without breaking the earlier client. Phase 2 also added the claim rate limiter, because claim submission is the first endpoint where a scripted attacker could generate notifications and owner workload at scale.

# 8. What we did not use, and why

Being explicit about the gaps matters more than claiming completeness:

- **No map API is called yet.** Deliverable 1 proposed Leaflet with OpenStreetMap, and Deliverable 2 lists it as IF-SW-04. The map is FR-SRCH-03, scheduled for Phase 3; there is no Leaflet dependency or tile request in `src/frontend`. Building a map early would have added a provider integration without a Phase 1 or Phase 2 requirement behind it.
- **No real-time socket.** IF-COM-03 explicitly says the system shall not require one and that REST polling must be no more frequent than every 15 seconds. The notification page loads on navigation and can be refreshed manually, which stays within that bound.
- **No cloud image host or CDN.** The free-tier constraint and the absence of a Phase 1/2 requirement made local disk plus `express.static` sufficient. This is the first thing to change if the API is scaled beyond one instance, because uploads on local disk are not shared.
- **No social login, payment, SMS, geocoding, or push-notification API.** None is required by the Phase 1 or Phase 2 requirement sets, and each would add a paid dependency or an account-provisioning step.
- **No Axios or state-management library.** Native `fetch` and React state cover the current call volume; adding a client library would not change any requirement.

# 9. Verifying the API

The API can be exercised without the frontend. With the backend running on port 5000:

```bash
curl http://127.0.0.1:5000/api/v1/health

curl "http://127.0.0.1:5000/api/v1/listings?type=found&category=Wallet&page=1"

curl -X POST http://127.0.0.1:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@unt.edu","password":"example-password"}'

curl http://127.0.0.1:5000/api/v1/notifications \
  -H "Authorization: Bearer <token>"
```

The automated checks that cover these interfaces are:

- **Backend:** `cd src/backend && pnpm exec jest --runInBand` — 7 suites, 32 tests, against `MONGODB_URI_TEST`, covering auth, listings, search, matching, claims, notifications, and rate limiting.
- **Frontend:** `cd src/frontend && pnpm build && pnpm lint` — production build succeeds; lint reports 0 errors.
- **Smoke test:** the Deliverable 4 report records a 27-check live run over match, competing claims, approval, closure, resolution, notifications, and email preference.

Configuration is entirely through `src/backend/.env`; no secret is committed. The variables that affect these interfaces are `PORT`, `MONGODB_URI`, `MONGODB_URI_TEST`, `JWT_SECRET`, `APP_BASE_URL`, `CLIENT_ORIGIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`, plus `VITE_API_BASE_URL` for the client.

# 10. Summary

The project exposes **24 application endpoints plus a health check** under a versioned `/api/v1` prefix, all JSON and all documented by status code. Authentication is a 1-hour JWT issued by our own API, with bcrypt-hashed passwords and hashed email tokens. MongoDB is reached only through Mongoose on the server, uploaded images are validated multipart files served from `/uploads`, and email goes through an authenticated SMTP provider with a single retry and a non-fatal failure path. The React client uses native `fetch`, `FormData`, and `localStorage`, with the backend origin supplied by `VITE_API_BASE_URL`.

Each of those choices traces to a Deliverable 1 constraint or a Deliverable 2 interface requirement, and each is visible in the files listed in Table 12. The two planned integrations that are not in the code — the Leaflet map and any real-time transport — are Phase 3 or explicitly excluded by IF-COM-03, not omissions from the Phase 1 and Phase 2 scope.
