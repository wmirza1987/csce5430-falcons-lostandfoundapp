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
| Frontend | React (ES6+) |
| Backend | Node.js + Express |
| Database | MongoDB (local Docker for development; Atlas free tier for deployment) |
| Notifications | Nodemailer |
| Maps | Leaflet + OpenStreetMap (no API key required) |
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
│   ├── backend/                  # Express API, MongoDB models, Jest tests
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

See each deliverable's `note-deliverable-*.txt` file at the repository root for the full manifest of files submitted with that milestone.

---

## Getting Started

### Prerequisites

- Node.js (LTS version) and npm or pnpm
- MongoDB 7+ (local Docker container or an Atlas connection string)
- Optional: an SMTP account (Mailtrap, Ethereal, or similar) for verification, reset, and notification email

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

### Required Environment Variables

Copy `src/backend/.env.example` to `src/backend/.env` and `src/frontend/.env.example` to `src/frontend/.env`. Never commit `.env`.

Backend (`src/backend/.env`):

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express API listens on (default `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_URI_TEST` | Separate database used by Jest (defaults to a `_test` suffix) |
| `JWT_SECRET` | Long random signing secret for authenticated sessions |
| `APP_BASE_URL` | Public client URL used in verification/reset links |
| `CLIENT_ORIGIN` | Comma-separated allowed browser origins for CORS |
| `SMTP_HOST` | Email provider host (leave blank to skip delivery locally) |
| `SMTP_PORT` | Email provider port |
| `SMTP_USER` | Email provider account username |
| `SMTP_PASS` | Email provider account password or API key |
| `SMTP_FROM` | "From" address used on outgoing email |

Frontend (`src/frontend/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL, e.g. `http://localhost:5000` |

### Running Locally

```bash
# optional local MongoDB
docker run -d --name lostfound-mongo --restart unless-stopped \
  -p 127.0.0.1:27017:27017 \
  -v lostfound-mongo-data:/data/db \
  mongo:7.0

# from src/backend
pnpm dev           # starts the API with hot reload

# from src/frontend, in a separate terminal
pnpm dev           # starts the React development server
```

### Running Tests

```bash
# from src/backend (uses MONGODB_URI_TEST or the local _test database)
pnpm test

# from src/frontend
pnpm build         # production build check
```

### Deployment

1. Push the `main` branch to GitHub.
2. Deploy `src/backend` to Render (or a similar free-tier host); set the environment variables listed above in the host's dashboard.
3. Deploy `src/frontend` to Vercel (or a similar free-tier host); set `CLIENT_ORIGIN` on the API to the deployed client URL and `VITE_API_BASE_URL` on the client to the API URL.
4. Confirm the deployed client can reach the deployed API before demoing.

---

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
