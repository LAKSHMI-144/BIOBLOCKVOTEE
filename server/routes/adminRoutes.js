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

router.post('/login', async (req, res) => {
    if (!configured()) return res.status(503).json({ success: false, message: `Admin login is not configured. Missing in server/.env: ${missing().join(', ')}. Run "npm run setup-admin -- <password>" in the server folder, then restart the server.` });
    if (recent(req.ip).length >= 5) return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !checkCredentials(username, password)) {
        fails.set(req.ip, [...recent(req.ip), Date.now()]);
        await audit(null, 'ADMIN_LOGIN_FAILED', 'admin');   // the attempted username/password are never recorded
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    fails.delete(req.ip);
    await audit(null, 'ADMIN_LOGIN', 'admin');
    res.json({ success: true, token: signToken(), expires_in: TTL_MS / 1000 });
});

// Chain status for the admin Blockchain page (the Python service itself is not exposed to the browser).
router.get('/blockchain', requireAdmin, async (req, res) => {
    try {
        const r = await require('../config/ai').get('/blockchain-status');
        if (r.status !== 200) return res.status(502).json({ success: false, message: 'AI service returned an error' });
        // Ballot secrecy: never hand the browser a block's chosen candidate next to its (hashed) voter.
        const chain = (r.data.chain || []).map(({ candidate, ...b }, i) => ({ ...b, vote_reference: b.index === 0 ? null : `VOTE-${String(b.index).padStart(4, '0')}` }));
        res.json({ ...r.data, chain });
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
        const election_type = String(b.election_type ?? cur.election_type).toUpperCase();
        const parse = v => (v === null || v === '' ? null : new Date(v));
        const start = b.start_time === undefined ? (cur.start_time && new Date(cur.start_time)) : parse(b.start_time);
        const end = b.end_time === undefined ? (cur.end_time && new Date(cur.end_time)) : parse(b.end_time);
        const errors = {};
        if (name.length < 3 || name.length > 150) errors.name = { code: 'NAME_INVALID', message: 'Election name must be 3-150 characters.' };
        if (!['PARLIAMENTARY', 'ASSEMBLY', 'OTHER'].includes(election_type)) errors.election_type = { code: 'TYPE_INVALID', message: 'Election type must be Parliamentary, Assembly or Other.' };
        if (election_type !== cur.election_type && (await db.query('SELECT 1 FROM candidates WHERE election_id = ? LIMIT 1', [cur.election_id]))[0].length)
            errors.election_type = { code: 'TYPE_LOCKED', message: 'The election type cannot change once candidates exist for this election.' };
        if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED'].includes(status)) errors.status = { code: 'STATUS_INVALID', message: 'Invalid status.' };
        if ((start && isNaN(start)) || (end && isNaN(end))) errors.start_time = { code: 'DATE_INVALID', message: 'Invalid date/time.' };
        if (['SCHEDULED', 'ACTIVE'].includes(status) && (!start || !end)) errors.start_time = { code: 'DATES_REQUIRED', message: 'Start and end time are required to schedule an election.' };
        if (start && end && end <= start) errors.end_time = { code: 'DATE_ORDER', message: 'End time must be after the start time.' };
        if (Object.keys(errors).length) return bad(res, errors);
        // ACTIVE is not stored: it is SCHEDULED with a window that contains "now".
        const stored = status === 'ACTIVE' ? 'SCHEDULED' : status;
        await db.query("UPDATE elections SET name=?, start_time=?, end_time=?, status=?, election_type=? WHERE election_id=?", [name, start, end, stored, election_type, cur.election_id]);
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

// Candidates, parties and constituencies live in their own router.
router.use(require('./adminCatalogRoutes'));
router.use(require('./adminDataRoutes'));

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
