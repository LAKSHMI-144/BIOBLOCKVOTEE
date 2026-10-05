# BlockBioVote – Demo Guide

## Before the demo (do this the day before)
1. MySQL running; database loaded once: `Get-Content database\schema.sql | mysql -u root -p` (or run it in Workbench).
2. `python_ai/.env` and `server/.env` filled in (see README). Admin credentials created once:
   `cd server` then `npm run setup-admin -- "your-password"`.
3. Start four things, each in its own terminal:
   - `python_ai`: `venv\Scripts\activate` then `python app.py` (wait for "Running on http://127.0.0.1:5001")
   - `server`: `npm start` – check it prints "Admin login configured"
   - `client`: `npm run dev`
4. Open http://localhost:5173 (use `localhost`, otherwise the camera is blocked). Open http://localhost:5000/api/health – all `ok`.
5. Pre-register two voters (you and a friend) so you can also show "different person". Check the camera works in good light.
6. Reset between rehearsals (clears votes; keeps voters): in MySQL run
   `UPDATE voters SET has_voted=FALSE; UPDATE candidates SET vote_count=0; DELETE FROM audit_log;` and **restart the Python service** (the chain is in memory).

## Demo sequence (about 10 minutes)
1. **Landing page** – explain the two portals and the 4 steps (Register, Verify, Vote, Record). Point at the "Security status" section: it honestly lists what is and is not done.
2. **Register a voter** – Voter Login → "Register as a voter" → details (age ≥ 18) → capture 3 images. Mention each capture is checked (one face, quality) and only an encrypted template is stored.
3. **Show rejections** – try two people in frame (rejected), cover the camera (rejected), register the same face under a new ID (rejected as duplicate).
4. **Face authentication** – Voter Login → enter the Voter ID → Authenticate. A different person is "not recognized".
5. **Voter dashboard** – status, election info (not configured – say so), Cast My Vote.
6. **Cast vote** – choose a candidate → confirm → receipt (block index, hashes).
7. **Try again** – log in again with the same face: "already voted".
8. **Admin login** – Admin & Auditor Portal → `admin` + your password.
9. **Dashboard** – registered voters, candidates, votes, blockchain VALID.
10. **Voters / Voting** – who is registered, who has voted; no biometric data shown.
11. **Audit logs** – registration, authentication, vote events (the vote row does not show the candidate).
12. **Blockchain** – block cards linked by previous hash; explain hash + previous hash.
13. **Results** – tallies and turnout.

## Questions you may be asked
- *Is it a real blockchain?* A single-node hash chain: tamper-evident, no consensus/network.
- *Does it stop a photo of a face?* Not yet – liveness detection is future work.
- *Where are faces stored?* Never as images; an encrypted 512-number template in MySQL.
- *Can the admin see who voted for whom?* The admin UI/API hides it; the database audit row currently includes it (listed limitation).
- *What if the AI service restarts?* The chain resets (listed limitation).
