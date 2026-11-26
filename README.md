# Lost and Found for Campus

A campus-wide web application that lets students, faculty, and staff report, search for, and recover lost items in one centralized, searchable platform — instead of scattered social media posts, bulletin boards, or a lost-and-found office nobody thinks to check.

**Course:** CSCE 5430, Software Engineering — Fall 2026, University of North Texas
**Team:** Falcons

---

## Team Falcons

| Name | ID | Role |
|---|---|---|
| Waleed Mirza | 1194980 | Team Leader — Project Management, Requirements, Demo |
| Venkata Sai Anirudh Naidu Mamidi | 11908399 | Backend Implementation Lead, Configuration Management Lead |
| Sai Sathvika Potluri | 11813771 | Design Lead, Documentation Lead |
| Sai Asritha Thati | 11909319 | Frontend Implementation Lead, Testing Lead |

---

## About the Project

Lost and Found for Campus centers on a simple core workflow: a user posts a lost or found item with a photo, location, description, and category; other users search and filter listings to find a match; and the original poster marks the item resolved once it's returned. Beyond that core workflow, the system is extended with seven additional modules to give the project sufficient depth:

- **Automated matching engine** — scores and ranks likely matches between Lost and Found listings by category, date, location, and keyword similarity
- **Notification service** — in-app and email alerts for matches, claims, and resolutions
- **Claim verification workflow** — private evidence submission and owner approval before a claim is confirmed
- **In-app messaging** — a private thread between an approved claimant and the finder
- **Interactive campus map view** — listings plotted by building or zone using Leaflet and OpenStreetMap
- **Admin and analytics dashboard** — aggregate statistics and moderation tools for campus staff
- **Role-based access control** — User, Moderator, and Administrator permission tiers

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (ES6+) + Vite |
| Backend | Node.js + Express 5 on Azure App Service (Linux) |
| Database | Azure SQL Database (parameterized queries via `mssql`) |
| Photos and claim evidence | Azure Blob Storage, private containers (evidence is AES-256-GCM encrypted) |
| Secrets | Azure Key Vault, read through App Service Key Vault references |
| Email | Azure Communication Services Email |
| Maps | Leaflet + OpenStreetMap |
| Identity to Azure services | System-assigned managed identity (no connection strings or passwords in config) |

The live deployment is described in `docs/azure-resources.md`.

---|---|
| Frontend | React (ES6+) |
| Backend | Node.js + Express |
| Database | MongoDB (local Docker for development; Atlas free tier for deployment) |
| Notifications | Azure Communication Services Email |
| Hosting | Render / Vercel (free tier) |

Every external dependency above is free-tier or no-cost by design, to keep the project easy to implement and inexpensive to run for the semester.

---

## Repository Structure

```
csce5430-falcons-lostandfoundapp/
├── README.md                     # This file
├── GROUP-INFO                    # Team roster and contact info
├── note-deliverable-1.txt        # File manifest for Deliverable 1
├── note-deliverable-2.txt        # File manifest for Deliverable 2
├── src/
│   ├── backend/                  # Express API, Azure SQL repositories, Jest tests
│   └── frontend/                 # React + Vite client
├── reports/                      # Submitted deliverable reports (Word/PDF)
├── planning/                     # Timelines, risk management, phase planning docs
├── design/                       # Wireframes, data schema, and design decisions
├── project-name/                 # Deliverable manifest / submission tracking files
├── Test/                         # Test plans and testing documentation
├── meeting-minutes/              # Meeting minutes, one subfolder per deliverable
│   ├── deliverable-1/
│   └── deliverable-2/
├── Admin_Dashboard_Requirements.md
├── UI_UX_Design_Notes.md
├── Workshop_Feedback_Action_Items.md
├── asritha-d1-frontend-testing-planning.txt
└── asritha-technology-research.txt
```

> Folder contents evolve each deliverable — if a folder's purpose has shifted since this was written, update the description above rather than leaving it stale.

## Requirements and Design Documents

- **Deliverable 1** — Project Proposal, Project Plan, and Risk Management: `reports/Team_Falcons_-_Deliverable_1.docx`
- **Deliverable 2** — Requirements Specifications, System Structure, and Development Phase Plan: `reports/Team_Falcons_-_Deliverable_2.docx`
- **Deliverable 4** — Phase 2 implementation report: `reports/deliverable-4/Deliverable-4-Report.md`
- **Deliverable 5** — Phase 3 audit and implementation changes: `reports/deliverable-5/Deliverable-5-Audit-and-Changes.md`

See each deliverable's `note-deliverable-*.txt` file at the repository root for the full manifest of files submitted with that milestone.

### Phase 3 API quick reference

All routes are versioned under `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/reports` | Signed-in user | Report a listing or message (reason 10–500 chars) |
| GET | `/reports` | Moderator/Admin | Moderation queue |
| GET | `/reports/:id` | Moderator/Admin | One report |
| PATCH | `/reports/:id/decision` | Moderator/Admin | `hide`, `restore`, or `dismiss` with a reason |
| GET | `/map/buildings` | Public | Approximate campus building catalog and zones |
| GET | `/map/listings` | Public | Listing pins by building/zone/type, plus list view |
| GET | `/admin/users` | Admin | Account list |
| PATCH | `/admin/users/:id/role` | Admin | Set `user` or `moderator` (admin role not assignable) |
| PATCH | `/admin/users/:id/active` | Admin | Deactivate/reactivate an account |
| GET/POST/PATCH | `/admin/categories` | Admin | Manage the item category catalog |
| GET | `/admin/audit` | Admin | Non-content audit records |
| GET | `/admin/analytics` | Admin | Aggregate counts, resolution rate, categories, hotspots |

Messaging refreshes no more than once every 15 seconds in the client, with a manual Refresh button; no sockets are required. Moderator thread access requires an open or reviewing report linked to that thread and is audit logged.

---

## Getting Started

### Prerequisites

- Node.js (LTS version) and npm or pnpm
- MongoDB 7+ (local Docker container or an Atlas connection string)
- Optional: an Azure Communication Services Email resource (`ACS_ENDPOINT`, `EMAIL_FROM`) for verification, reset, and notification email; without it, email is skipped

### Installation

```bash
git clone https://github.com/wmirza1987/csce5430-falcons-lostandfoundapp.git
cd csce5430-falcons-lostandfoundapp

# install API dependencies
cd src/backend
pnpm install

# install client dependencies
cd ../frontend
pnpm install
```

### Environment Variables

Copy `src/backend/.env.example` to `src/backend/.env` and `src/frontend/.env.example` to `src/frontend/.env`. Never commit `.env`. The example files list every setting with no real values. Key settings: `DB_SERVER`, `DB_NAME`, `DB_AUTH` (`aad` for Azure, `windows` or `sql` for a local SQL Server), `DB_NAME_TEST`, `JWT_SECRET`, `EVIDENCE_ENCRYPTION_KEY`, `STORAGE_ACCOUNT_NAME`, `ACS_ENDPOINT`, `EMAIL_FROM`, `APP_BASE_URL`, `CLIENT_ORIGIN`, `MATCH_THRESHOLD`.

When `STORAGE_ACCOUNT_NAME` is unset the API stores files under `.local-storage/`, and when `ACS_ENDPOINT` is unset email delivery is skipped (notifications are still created in-app).

### Running Locally

```bash
# from src/backend: apply the schema, then start the API
node db/migrate.js
pnpm dev

# from src/frontend, in a separate terminal
pnpm dev
```

A local SQL Server (for example SQL Server Express) works for development. Optional demo data: `pnpm seed` (see `.env.example`).

### Running Tests

```bash
# from src/backend (runs against DB_NAME_TEST; refuses to touch DB_NAME)
pnpm test

# from src/frontend
pnpm build
pnpm lint
```

### Deployment

The API App Service also serves the built client (`src/backend/public`, produced by `pnpm build` in `src/frontend`), so the site is a single origin with no CORS. Rate limiting is an in-memory limiter and is correct for a single instance only; scale-out would need a shared store such as Azure Cache for Redis.

## Project Timeline

| Deliverable | Due Date | Focus |
|---|---|---|
| Deliverable 1 | Sep 7, 2026 | Proposal, plan, and risk management |
| Deliverable 2 | Sep 28, 2026 | Requirements specifications and system structure |
| Deliverable 3 | Oct 19, 2026 | System design (wireframes, schema, API endpoints) |
| Deliverable 4 | Nov 9, 2026 | Core implementation |
| Deliverable 5 | Nov 30, 2026 | Final implementation, testing, and demo |

---

## License

Course project for CSCE 5430, Software Engineering, Fall 2026, University of North Texas. Not licensed for external use or distribution.
