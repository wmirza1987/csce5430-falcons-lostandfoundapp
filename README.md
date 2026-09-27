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
| Database | MongoDB Atlas (free tier) |
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
├── src/                          # Application source code (client + API)
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

- Node.js (LTS version) and npm
- A MongoDB Atlas account (free tier) and connection string
- An email account or provider for transactional email (a free SMTP account, Mailtrap, or Ethereal work for development)

### Installation

```bash
git clone https://github.com/wmirza1987/csce5430-falcons-lostandfoundapp.git
cd csce5430-falcons-lostandfoundapp

# install API dependencies
cd src/server
npm install

# install client dependencies
cd ../client
npm install
```

### Required Environment Variables

Set these in a `.env` file in `src/server/` (never commit actual secret values — this file documents names only):

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express API listens on |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Signing secret for authenticated sessions |
| `JWT_EXPIRES_IN` | Session token expiration window |
| `CAMPUS_EMAIL_DOMAINS` | Comma-separated allowed registration domains (e.g. `my.unt.edu,unt.edu`) |
| `SMTP_HOST` | Email provider host |
| `SMTP_PORT` | Email provider port |
| `SMTP_USER` | Email provider account username |
| `SMTP_PASS` | Email provider account password or API key |
| `EMAIL_FROM` | "From" address used on outgoing email |
| `CLIENT_ORIGIN` | Deployed client URL, for CORS |
| `NODE_ENV` | `development` or `production` |

### Running Locally

```bash
# from src/server
npm run dev        # starts the API with hot reload

# from src/client, in a separate terminal
npm run dev        # starts the React development server
```

### Running Tests

```bash
# from src/server
npm test           # runs the API test suite

# from src/client
npm test           # runs the client test suite
```

### Deployment

1. Push the `main` branch to GitHub.
2. Deploy `src/server` to Render (or a similar free-tier host); set the environment variables listed above in the host's dashboard.
3. Deploy `src/client` to Vercel (or a similar free-tier host); set `CLIENT_ORIGIN` on the API to the deployed client URL.
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
