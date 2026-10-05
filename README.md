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
Upgrading an older database? Run `cd server && npm run migrate` (safe to run repeatedly).

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

## Voter registration (current behaviour)
1. Enter details (Voter ID, name, age ≥ 18 → eligible).
2. Capture 3–5 webcam images. Each is checked immediately: exactly one face, face size, blur, brightness, roughly frontal.
3. The images are turned into one 512-d ArcFace template, **encrypted (Fernet)** and stored in `voters.face_encoding`. No image is stored.
4. Rejected: no face, multiple faces, poor quality, identical frames, captures of different people, and a face already registered under another voter ID.

## Known limitations (work in progress)
* **Liveness detection is not implemented yet** – a printed photo can currently pass. (Planned: Phase 4.)
* Existing face templates from the old `face_recognition` (dlib) version are incompatible – those voters must re-register.
* `POST /api/votes/cast` does not yet require a prior successful face authentication, and vote/blockchain writes are not atomic. (Planned: Phase 6/10.)
* The blockchain lives in Python memory and resets when the AI service restarts. (Planned: Phase 7.)
* Admin login is minimal (one env-configured account, 2-hour token, in-memory brute-force limit). No roles or election periods yet. (Planned: Phases 5, 10.)
* Candidate add/edit/remove, election status and failed-login/security-event auditing do not exist yet, so those admin screens are read-only or absent.
* The voter dashboard is presentation: `POST /api/votes/cast` still trusts the `voter_id` sent by the browser, and the entered Voter ID is only cross-checked in the browser.

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
| `/` | Landing page |
| `/voter/login` → `/voter/authenticate` → `/voter/dashboard` → `/voter/vote` | Voter flow (also `/voter/register`) |
| `/admin/login` → `/admin` (dashboard, `candidates`, `voters`, `audit`, `blockchain`, `results`) | Admin / auditor portal |

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
| `python_ai/.env` | `DB_*`, `INTERNAL_API_KEY`, `FACE_ENCRYPTION_KEY` | Database, shared secret, key encrypting face templates |
| `client/.env` (optional) | `VITE_API_BASE_URL` | Node server root, default `http://localhost:5000` |

Real `.env` files are git-ignored. Only the `.env.example` files are committed - never paste real values into them.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `'vite' is not recognized` / `Cannot find module 'dotenv'` / `No module named 'mysql'` | Dependencies not installed: `npm install` in `client` and `server`; `pip install -r requirements.txt` in `python_ai` |
| "Admin login is not configured" | Run `npm run setup-admin -- "<password>"` in `server`, then restart Node. The message names the missing variables. |
| Admin pages show "Admin authentication required" | Token expired (2 h) - sign in again |
| Frontend on port 5174 cannot reach the API | Fixed: any `localhost` port is allowed in development |
| `/api/health` shows `ai_service: down` | Start `python app.py` in `python_ai` (first start downloads ~300 MB of models) |
| `/api/health` shows `database: down` | MySQL not running, or `DB_PASSWORD` wrong in `server/.env` |
| Camera does not start | Open the app at `http://localhost:5173` (not an IP address) and allow camera access |
| Blockchain shows fewer blocks than votes | The chain is in memory and was reset by restarting the AI service |
