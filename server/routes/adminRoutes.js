const express = require('express');
const router = express.Router();
const db = require('../config/db');
const requireAdmin = require('../middleware/requireAdmin');
const { configured, missing, checkCredentials, signToken, TTL_MS } = require('../config/adminAuth');
const ai = require('../config/ai');
const audit = require('../config/audit');
const election = require('../config/election');
const identity = require('../services/identity');
const tokens = require('../config/tokens');

// Basic brute-force protection: 5 failed logins per IP per 15 minutes.
const fails = new Map();
const WINDOW = 15 * 60 * 1000;
const recent = ip => (fails.get(ip) || []).filter(t => Date.now() - t < WINDOW);

router.post('/login', (req, res) => {
    if (!configured()) return res.status(503).json({ success: false, message: `Admin login is not configured. Missing in server/.env: ${missing().join(', ')}. Run "npm run setup-admin -- <password>" in the server folder, then restart the server.` });
    if (recent(req.ip).length >= 5) return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !checkCredentials(username, password)) {
        fails.set(req.ip, [...recent(req.ip), Date.now()]);
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    fails.delete(req.ip);
    res.json({ success: true, token: signToken(), expires_in: TTL_MS / 1000 });
});

// Raw audit rows only (voter_id, action, timestamp) – no biometric data exists in this table.
router.get('/audit-logs', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, voter_id, action, actor, timestamp FROM audit_log ORDER BY id DESC LIMIT 200");
        // Ballot secrecy: the vote event stores the chosen candidate; never reveal who voted for whom.
        res.json(rows.map(r => ({ ...r, action: r.action.startsWith('VOTED_FOR:') ? 'VOTED_FOR' : r.action })));
    } catch (e) {
        console.error('audit-logs error:', e.message);
        res.status(500).json({ success: false, message: 'Could not load audit logs' });
    }
});

// Chain status for the admin Blockchain page (the Python service itself is not exposed to the browser).
router.get('/blockchain', requireAdmin, async (req, res) => {
    try {
        const r = await require('../config/ai').get('/blockchain-status');
        if (r.status !== 200) return res.status(502).json({ success: false, message: 'AI service returned an error' });
        res.json(r.data);
    } catch (e) {
        res.status(503).json({ success: false, message: 'AI service is unavailable. Start python_ai (python app.py).' });
    }
});

// ---------- Election management ----------
const bad = (res, errors, status = 400) => { const f = Object.values(errors)[0]; return res.status(status).json({ success: false, code: f.code, message: f.message, errors }); };

router.get('/election', requireAdmin, async (req, res) => {
    try { const e = await election.current(); res.json({ ...e, status_stored: e.status, status: e.effective_status }); }
    catch (e) { console.error('admin election error:', e.message); res.status(500).json({ success: false, message: 'Could not load election' }); }
});

// Update name / window / status. Allowed stored statuses: DRAFT, SCHEDULED, ENDED (ACTIVE is derived from the clock).
router.put('/election', requireAdmin, async (req, res) => {
    try {
        const cur = await election.current();
        const b = req.body || {};
        const name = String(b.name ?? cur.name).trim();
        const status = String(b.status ?? cur.status).toUpperCase();
        const parse = v => (v === null || v === '' ? null : new Date(v));
        const start = b.start_time === undefined ? (cur.start_time && new Date(cur.start_time)) : parse(b.start_time);
        const end = b.end_time === undefined ? (cur.end_time && new Date(cur.end_time)) : parse(b.end_time);
        const errors = {};
        if (name.length < 3 || name.length > 150) errors.name = { code: 'NAME_INVALID', message: 'Election name must be 3-150 characters.' };
        if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED'].includes(status)) errors.status = { code: 'STATUS_INVALID', message: 'Invalid status.' };
        if ((start && isNaN(start)) || (end && isNaN(end))) errors.start_time = { code: 'DATE_INVALID', message: 'Invalid date/time.' };
        if (['SCHEDULED', 'ACTIVE'].includes(status) && (!start || !end)) errors.start_time = { code: 'DATES_REQUIRED', message: 'Start and end time are required to schedule an election.' };
        if (start && end && end <= start) errors.end_time = { code: 'DATE_ORDER', message: 'End time must be after the start time.' };
        if (Object.keys(errors).length) return bad(res, errors);
        // ACTIVE is not stored: it is SCHEDULED with a window that contains "now".
        const stored = status === 'ACTIVE' ? 'SCHEDULED' : status;
        await db.query("UPDATE elections SET name=?, start_time=?, end_time=?, status=? WHERE election_id=?", [name, start, end, stored, cur.election_id]);
        await audit(null, `ELECTION_UPDATED:${stored}`, 'admin');
        const e = await election.current();
        res.json({ success: true, election: { ...e, status_stored: e.status, status: e.effective_status } });
    } catch (e) { console.error('election update error:', e.message); res.status(500).json({ success: false, message: 'Could not update election' }); }
});

// Convenience for demos: open voting now for N hours.
router.post('/election/open-now', requireAdmin, async (req, res) => {
    try {
        const hours = Number(req.body?.hours ?? 2);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 72) return bad(res, { hours: { code: 'HOURS_INVALID', message: 'Hours must be between 0 and 72.' } });
        const cur = await election.current();
        await db.query("UPDATE elections SET start_time=?, end_time=?, status='SCHEDULED' WHERE election_id=?", [new Date(Date.now() - 1000), new Date(Date.now() + hours * 3600 * 1000), cur.election_id]);
        await audit(null, 'ELECTION_OPENED', 'admin');
        const e = await election.current();
        res.json({ success: true, election: { ...e, status_stored: e.status, status: e.effective_status } });
    } catch (e) { console.error('open-now error:', e.message); res.status(500).json({ success: false, message: 'Could not open election' }); }
});
router.post('/election/close', requireAdmin, async (req, res) => {
    try {
        const cur = await election.current();
        await db.query("UPDATE elections SET status='ENDED', end_time=LEAST(COALESCE(end_time, ?), ?) WHERE election_id=?", [new Date(), new Date(), cur.election_id]);
        await audit(null, 'ELECTION_CLOSED', 'admin');
        const e = await election.current();
        res.json({ success: true, election: { ...e, status_stored: e.status, status: e.effective_status } });
    } catch (e) { console.error('close error:', e.message); res.status(500).json({ success: false, message: 'Could not close election' }); }
});

// ---------- Candidate management ----------
const locked = async () => { const e = await election.current(); return e && ['ACTIVE', 'ENDED'].includes(e.effective_status) ? e.effective_status : null; };
function cleanCandidate(b) {
    const name = String(b.name ?? '').trim(), party = String(b.party ?? '').trim();
    const symbol = String(b.symbol ?? '').trim(), description = String(b.description ?? '').trim();
    const errors = {};
    if (name.length < 2 || name.length > 100) errors.name = { code: 'NAME_INVALID', message: 'Candidate name must be 2-100 characters.' };
    if (party.length < 2 || party.length > 100) errors.party = { code: 'PARTY_INVALID', message: 'Party / group must be 2-100 characters.' };
    if ([...symbol].length > 4) errors.symbol = { code: 'SYMBOL_INVALID', message: 'Symbol must be at most 4 characters.' };
    if (description.length > 500) errors.description = { code: 'DESC_LONG', message: 'Description must be at most 500 characters.' };
    return { name, party, symbol: symbol || null, description: description || null, errors };
}
const lockedMsg = s => ({ success: false, code: 'ELECTION_LOCKED', message: `Candidates cannot be changed while the election is ${s}.` });

router.get('/candidates', requireAdmin, async (req, res) => {
    try { const [r] = await db.query("SELECT candidate_id, name, party, symbol, description, is_active, vote_count FROM candidates ORDER BY candidate_id"); res.json(r); }
    catch (e) { console.error('admin candidates error:', e.message); res.status(500).json({ success: false, message: 'Could not load candidates' }); }
});
router.post('/candidates', requireAdmin, async (req, res) => {
    try {
        const c = cleanCandidate(req.body || {});
        if (Object.keys(c.errors).length) return bad(res, c.errors);
        const l = await locked(); if (l) return res.status(409).json(lockedMsg(l));
        const cur = await election.current();
        const [r] = await db.query("INSERT INTO candidates (name, party, symbol, description, election_id) VALUES (?,?,?,?,?)", [c.name, c.party, c.symbol, c.description, cur.election_id]);
        await audit(null, `CANDIDATE_ADDED:${r.insertId}`, 'admin');
        res.status(201).json({ success: true, candidate_id: r.insertId });
    } catch (e) { console.error('add candidate error:', e.message); res.status(500).json({ success: false, message: 'Could not add candidate' }); }
});
router.put('/candidates/:id', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const c = cleanCandidate(req.body || {});
        if (Object.keys(c.errors).length) return bad(res, c.errors);
        const l = await locked(); if (l) return res.status(409).json(lockedMsg(l));
        const [r] = await db.query("UPDATE candidates SET name=?, party=?, symbol=?, description=? WHERE candidate_id=?", [c.name, c.party, c.symbol, c.description, id]);
        if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Candidate not found' });
        await audit(null, `CANDIDATE_EDITED:${id}`, 'admin');
        res.json({ success: true });
    } catch (e) { console.error('edit candidate error:', e.message); res.status(500).json({ success: false, message: 'Could not update candidate' }); }
});
router.post('/candidates/:id/active', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id), active = req.body?.active === true;
        const l = await locked(); if (l) return res.status(409).json(lockedMsg(l));
        const [r] = await db.query("UPDATE candidates SET is_active=? WHERE candidate_id=?", [active, id]);
        if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Candidate not found' });
        await audit(null, `CANDIDATE_${active ? 'ACTIVATED' : 'DEACTIVATED'}:${id}`, 'admin');
        res.json({ success: true });
    } catch (e) { console.error('candidate active error:', e.message); res.status(500).json({ success: false, message: 'Could not update candidate' }); }
});

// ---------- Security / system status ----------
router.get('/security', requireAdmin, async (req, res) => {
    const out = { admin_auth: configured() ? 'configured' : 'NOT configured', database: 'down', ai_service: 'down', blockchain: null,
        identity: identity.info(), session_secret: tokens.usingEphemeral ? 'ephemeral (sessions reset on restart)' : 'configured',
        blockchain_persistence: 'memory-only (resets when the Python AI service restarts)' };
    try { await db.query('SELECT 1'); out.database = 'ok'; } catch { /* keep down */ }
    try { const r = await ai.get('/blockchain-status'); if (r.status === 200) { out.ai_service = 'ok'; out.blockchain = { is_valid: r.data.is_valid, total_blocks: r.data.total_blocks }; } } catch { /* keep down */ }
    res.json(out);
});

module.exports = router;
