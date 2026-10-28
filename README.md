# BlockBioVote – Blockchain-Based Biometric E-Voting System

Academic prototype: face-authenticated voting with a tamper-evident vote chain.

> Note: the MySQL database is still named `securevoteai` (a legacy name). It is only an internal identifier and can be renamed later.

```
React (Vite) :5173 ──► Node/Express :5000 ──► Python Flask AI :5001
                              │                     │  InsightFace (detection + ArcFace embeddings)
                              └───────► MySQL ◄─────┘  blockchain.py (SHA-256 chain)
```

Docs: [PROJECT_GUIDE.md](PROJECT_GUIDE.md) (how it works) · [DEMO_GUIDE.md](DEMO_GUIDE.md) (how to demo)

## Prerequisites
Node 18+, Python 3.10–3.12, MySQL 8 (or MariaDB 10.6+), a webcam.

## Setup

### 1. Database
From the project root (`BLOCKCHAIN-SECURE-AI-VOTE`):
```
mysql -u root -p < database/schema.sql          # macOS/Linux/cmd
Get-Content database\schema.sql | mysql -u root -p   # PowerShell
```
If your terminal is already inside the `database` folder, the file is `schema.sql` (not `database\schema.sql`):
```
Get-Content schema.sql | mysql -u root -p       # PowerShell
```
If `mysql` is not recognised, use its full path (e.g. `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`) or run `schema.sql` in MySQL Workbench / the VS Code MySQL panel.
Older database? The Node server now upgrades the schema itself on every start (adds missing columns/tables only, never drops or rewrites data) and prints what it changed. `cd server && npm run migrate` does the same on demand. A database created before `is_eligible` existed is exactly what caused "Registration failed. Please try again." earlier.

### Optional illustrative candidate data

After initializing the database, run `cd server && npm run seed-demo` to insert missing illustrative party, geography, and fictional candidate rows. The seed is repeatable and inserts only missing records; it does not delete or update existing records. Newly inserted demo candidates are inactive, have no election assigned, and are labelled as fictional in their descriptions. Existing rows retain their current fields. These are not real election candidates or an official candidate list.

### 2. Python AI service (port 5001)
```
cd python_ai
python -m venv venv && venv\Scripts\activate      # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env                             # (macOS/Linux: cp)
```
Edit `python_ai/.env`:
* `DB_PASSWORD` – your MySQL password
* `INTERNAL_API_KEY` – any long random string (same value goes in `server/.env`)
* `FACE_ENCRYPTION_KEY` – generate with
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
  (keep it: without it stored face templates cannot be read)

```
python app.py
```
First start downloads the InsightFace models (~300 MB, one time) – wait for "Running on http://127.0.0.1:5001".

### 3. Node server (port 5000)
```
cd server
npm install
copy .env.example .env      # set DB_PASSWORD and the SAME INTERNAL_API_KEY
npm start
```
Check everything is wired: open http://localhost:5000/api/health → `{"server":"ok","database":"ok","ai_service":"ok"}`.

### 4. React client (port 5173)
```
cd client
npm install
npm run dev
```
Open http://localhost:5173 (use `localhost`, not an IP, so the browser allows camera access).

## Registration flow
1. **Details** – Voter ID, full name, age (18+), address, gender. Validated in the browser (errors shown beside each field) and again on the server, which is what counts. This step creates the voter record (once; clicking Next twice cannot create a duplicate) and returns a short-lived registration ticket.
2. **Identity verification (OTP)** – mobile number → 6-digit OTP (5-minute expiry, 5 wrong tries, 30 s resend cooldown, 5 sends max). See "Identity verification" below. Skippable only by an administrator setting `IDENTITY_MODE=off`.
3. **Face** – capture 3–5 webcam images. Each is checked immediately by the AI service: exactly one face, size, blur, brightness, roughly frontal. The images become one 512-d ArcFace template, **encrypted (Fernet)** and stored in `voters.face_encoding`. No image is stored.
4. Rejected: no face, multiple faces, poor quality, identical frames, captures of different people, and a face already registered under another voter ID.

An abandoned half-finished registration frees its Voter ID after 1 hour.

## Voting flow
Voter ID → **face verification** (the server checks the face belongs to that Voter ID) → the server issues a 15-minute **session token** bound to that voter → candidate list → vote. `POST /api/votes/cast` takes the voter **only from that token** (a `voter_id` in the request body is ignored) and refuses when the election is not ACTIVE ("Voting is currently closed."). The one-vote rule is enforced in the database with an atomic `UPDATE ... WHERE has_voted = FALSE`, so parallel requests cannot create a second vote.

## Admin flow
Admin login → dashboard. Admins can: schedule the election (name, start, end; `DRAFT → SCHEDULED → ACTIVE → ENDED`, or "open now"), add/edit/deactivate candidates (only while voting is not active), view voters, voting activity, results, the blockchain and the audit log. Every admin API requires the admin token (401 otherwise).

## Identity verification (OTP) – development only
`IDENTITY_PROVIDER=mock` is a **Development / Demo Verification**. It sends **no SMS** and verifies **no one's identity**; the OTP is the fixed `DEV_MOCK_OTP` (default `123456`). The UI says so. It is **not** Aadhaar or any government verification, and the project does not store, log or put on the chain any Aadhaar/ID number or OTP (only a SHA-256 hash of the phone number and its last 4 digits are stored; note a phone-number hash is guessable by brute force, so treat it as pseudonymised, not anonymous). To use a real authorised provider, add a module in `server/services/identity/` implementing `sendOtp(contact, ctx)` and `checkOtp(contact, otp, ctx)` and select it with `IDENTITY_PROVIDER`; the policy (expiry, retries, cooldown) stays in `services/identity/index.js`. With `NODE_ENV=production` the mock is refused unless `ALLOW_MOCK_IDENTITY=true`.

## Languages
The voter-facing UI is available in English, ಕನ್ನಡ and हिन्दी (switcher in the header). Strings live in `client/src/i18n/{en,kn,hi}.js`; `npm run check:i18n` in `client` verifies all three have the same keys. Admin pages are English only.

## Known limitations
* **Liveness detection is NOT implemented** – a printed photo can pass face matching.
* **The blockchain is in memory only.** It lives in the Python AI service and **resets when that service restarts**, while the database keeps `has_voted` and `vote_count`. Persistence is NOT implemented. The voter hash in each block is an unsalted SHA-256 of the Voter ID.
* The voter session is held in browser memory: refreshing the page requires logging in again. Registration/voter tokens are signed with `SESSION_SECRET`; if it is empty they are lost whenever the server restarts.
* Admin login is one env-configured account (2-hour token); the brute-force limit and the other rate limits are in memory.
* Real Aadhaar/government identity verification is NOT implemented (only the mock provider above).
* A crash between "block added" and "count incremented" could leave a block without a matching count; there is no reconciliation job.
* Existing face templates from the old `face_recognition` (dlib) version are incompatible – those voters must re-register.

## Running in VS Code (why double-clicking `index.html` shows nothing)
`client/index.html` only contains an empty `<div id="root">` and a `<script src="/src/main.jsx">`. Browsers cannot run JSX or resolve `import 'react'` from a `file://` page, so the app must be served by the Vite dev server (`npm run dev`), which compiles the JSX on the fly. The full system needs **four things running at once**, each in its own VS Code terminal (Terminal → New Terminal, use the `+` button for more):

| # | Service | Folder | Command | URL |
|---|---------|--------|---------|-----|
| 1 | MySQL | – | start the MySQL service | port 3306 |
| 2 | Python AI | `python_ai` | `python app.py` | http://localhost:5001/health |
| 3 | Node API | `server` | `npm start` | http://localhost:5000/api/health |
| 4 | React (Vite) | `client` | `npm run dev` | **http://localhost:5173** |

The pages that need no backend (Home) load with only #4; Register/Vote/Results/Blockchain need #1–#3.

## Portals and routes
| Route | Purpose |
|---|---|
| `/` | Landing page (voter login / register; Admin is a discreet link in the header) |
| `/voter/login` → `/voter/authenticate` → `/voter/dashboard` → `/voter/vote` | Voter flow (also `/voter/register`) |
| `/admin/login` → `/admin` (dashboard, `election`, `candidates`, `voters`, `voting`, `audit`, `blockchain`, `results`) | Admin / auditor portal |

## Admin login setup
Credentials live only in `server/.env` (never in Git or React):
```
cd server
node scripts/hash-admin-password.js "a-strong-password-here"
```
Easier: `cd server && npm run setup-admin -- "a-strong-password"` writes the three admin values into `server/.env` for you; then restart the server. If the login says "not configured", the message lists which variables are missing.

## Environment variables
| File | Variable | Meaning |
|---|---|---|
| `server/.env` | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection (`DB_NAME=securevoteai`) |
| `server/.env` | `PYTHON_AI_URL`, `INTERNAL_API_KEY` | AI service address; shared secret (same value in `python_ai/.env`) |
| `server/.env` | `CORS_ORIGINS` | Allowed browser origins; any `localhost` port is also accepted outside production |
| `server/.env` | `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOKEN_SECRET` | Created by `npm run setup-admin -- "<password>"` |
| `server/.env` | `SESSION_SECRET` | Signs registration/voter session tokens (long random string) |
| `server/.env` | `IDENTITY_MODE`, `IDENTITY_PROVIDER`, `DEV_MOCK_OTP` | OTP step on/off, provider (`mock`), the mock's test OTP |
| `python_ai/.env` | `DB_*`, `INTERNAL_API_KEY`, `FACE_ENCRYPTION_KEY` | Database, shared secret, key encrypting face templates |
| `client/.env` (optional) | `VITE_API_BASE_URL` | Node server root, default `http://localhost:5000` |

Real `.env` files are git-ignored. Only the `.env.example` files are committed - never paste real values into them.

## Tests
With MySQL, the AI service and Node running, on a scratch database:
```
cd tests/phase3
python make_test_images.py
python test_registration_api.py                      # registration + OTP + face (empty voters table)
ADMIN_PW="<admin password>" python test_flow_api.py   # admin auth, election rules, candidates, voting, results, chain
```

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `'vite' is not recognized` / `Cannot find module 'dotenv'` / `No module named 'mysql'` | Dependencies not installed: `npm install` in `client` and `server`; `pip install -r requirements.txt` in `python_ai` |
| "Registration failed. Please try again." | Look at the Node terminal: it prints the real cause. The usual one is an old database (fixed by restarting Node, which upgrades the schema), or the AI service/MySQL being down (`/api/health`). |
| "Voting is currently closed." | Admin → Election: set start/end and status, or "Open now" |
| "Admin login is not configured" | Run `npm run setup-admin -- "<password>"` in `server`, then restart Node. The message names the missing variables. |
| Admin pages show "Admin authentication required" | Token expired (2 h) - sign in again |
| Frontend on port 5174 cannot reach the API | Fixed: any `localhost` port is allowed in development |
| `/api/health` shows `ai_service: down` | Start `python app.py` in `python_ai` (first start downloads ~300 MB of models) |
| `/api/health` shows `database: down` | MySQL not running, or `DB_PASSWORD` wrong in `server/.env` |
| Camera does not start | Open the app at `http://localhost:5173` (not an IP address) and allow camera access |
| Blockchain shows fewer blocks than votes | The chain is in memory and was reset by restarting the AI service |
