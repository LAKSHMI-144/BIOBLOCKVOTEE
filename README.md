# BlockBioVote – Blockchain-Based Biometric E-Voting System

Academic prototype: face-authenticated voting with a tamper-evident vote chain.

> Note: the MySQL database is still named `securevoteai` (a legacy name). It is only an internal identifier and can be renamed later.

```
React (Vite) :5173 ──► Node/Express :5000 ──► Python Flask AI :5001
                              │                     │  InsightFace (detection + ArcFace embeddings)
                              └───────► MySQL ◄─────┘  blockchain.py (SHA-256 chain)
```

## Prerequisites
Node 18+, Python 3.10–3.12, MySQL 8 (or MariaDB 10.6+), a webcam.

## Setup

### 1. Database
```
mysql -u root -p < database/schema.sql
```
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
* No admin login/roles or election periods yet. (Planned: Phases 5, 10.)

## Running in VS Code (why double-clicking `index.html` shows nothing)
`client/index.html` only contains an empty `<div id="root">` and a `<script src="/src/main.jsx">`. Browsers cannot run JSX or resolve `import 'react'` from a `file://` page, so the app must be served by the Vite dev server (`npm run dev`), which compiles the JSX on the fly. The full system needs **four things running at once**, each in its own VS Code terminal (Terminal → New Terminal, use the `+` button for more):

| # | Service | Folder | Command | URL |
|---|---------|--------|---------|-----|
| 1 | MySQL | – | start the MySQL service | port 3306 |
| 2 | Python AI | `python_ai` | `python app.py` | http://localhost:5001/health |
| 3 | Node API | `server` | `npm start` | http://localhost:5000/api/health |
| 4 | React (Vite) | `client` | `npm run dev` | **http://localhost:5173** |

The pages that need no backend (Home) load with only #4; Register/Vote/Results/Blockchain need #1–#3.
