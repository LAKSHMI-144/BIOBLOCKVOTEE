const express = require('express');
const router = express.Router();
const db = require('../config/db');
const requireAdmin = require('../middleware/requireAdmin');
const { configured, missing, checkCredentials, signToken, TTL_MS } = require('../config/adminAuth');

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

router.get('/candidates', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT candidate_id, name, party, symbol, COALESCE(position, 'President') AS position, COALESCE(status, 'Active') AS status, vote_count FROM candidates ORDER BY candidate_id ASC"
        );
        res.json(rows);
    } catch (e) {
        console.error('admin candidates list error:', e.message);
        res.status(500).json({ success: false, message: 'Could not load candidate data' });
    }
});

router.post('/candidates', requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const candidate_id = String(body.candidate_id || '').trim();
        const name = String(body.name || '').trim();
        const party = String(body.party || '').trim();
        const position = String(body.position || '').trim() || 'President';
        const status = String(body.status || 'Active').trim() || 'Active';
        const symbol = String(body.symbol || '').trim() || position.slice(0, 2).toUpperCase();

        if (!candidate_id) return res.status(400).json({ success: false, message: 'Candidate ID is required.' });
        if (!name) return res.status(400).json({ success: false, message: 'Candidate name is required.' });
        if (!party) return res.status(400).json({ success: false, message: 'Party or organization is required.' });
        if (!position) return res.status(400).json({ success: false, message: 'Position is required.' });

        const [existing] = await db.query('SELECT candidate_id FROM candidates WHERE candidate_id = ?', [candidate_id]);
        if (existing.length > 0) return res.status(409).json({ success: false, message: 'Candidate ID already exists.' });

        await db.query(
            'INSERT INTO candidates (candidate_id, name, party, symbol, position, status, vote_count) VALUES (?, ?, ?, ?, ?, ?, 0)',
            [candidate_id, name, party, symbol, position, status]
        );

        const [rows] = await db.query(
            'SELECT candidate_id, name, party, symbol, COALESCE(position, "President") AS position, COALESCE(status, "Active") AS status, vote_count FROM candidates WHERE candidate_id = ?',
            [candidate_id]
        );

        res.status(201).json({ success: true, candidate: rows[0] });
    } catch (e) {
        console.error('admin create candidate error:', e.message);
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Candidate ID already exists.' });
        res.status(500).json({ success: false, message: 'Could not create candidate.' });
    }
});

router.put('/candidates/:id', requireAdmin, async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const party = String(body.party || '').trim();
        const position = String(body.position || '').trim() || 'President';
        const status = String(body.status || 'Active').trim() || 'Active';
        const symbol = String(body.symbol || '').trim() || position.slice(0, 2).toUpperCase();

        if (!id) return res.status(400).json({ success: false, message: 'Candidate ID is required.' });
        if (!name) return res.status(400).json({ success: false, message: 'Candidate name is required.' });
        if (!party) return res.status(400).json({ success: false, message: 'Party or organization is required.' });

        const [rows] = await db.query(
            'SELECT vote_count FROM candidates WHERE candidate_id = ?',
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Candidate not found.' });

        await db.query(
            'UPDATE candidates SET name = ?, party = ?, symbol = ?, position = ?, status = ? WHERE candidate_id = ?',
            [name, party, symbol, position, status, id]
        );

        const [updated] = await db.query(
            'SELECT candidate_id, name, party, symbol, COALESCE(position, "President") AS position, COALESCE(status, "Active") AS status, vote_count FROM candidates WHERE candidate_id = ?',
            [id]
        );

        res.json({ success: true, candidate: updated[0] });
    } catch (e) {
        console.error('admin update candidate error:', e.message);
        res.status(500).json({ success: false, message: 'Could not update candidate.' });
    }
});

router.delete('/candidates/:id', requireAdmin, async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        const [rows] = await db.query('SELECT vote_count, status FROM candidates WHERE candidate_id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Candidate not found.' });

        if (Number(rows[0].vote_count) > 0) {
            return res.status(409).json({
                success: false,
                message: 'This candidate has recorded votes and cannot be permanently deleted. Deactivate the candidate instead.'
            });
        }

        await db.query('DELETE FROM candidates WHERE candidate_id = ?', [id]);
        res.json({ success: true, message: 'Candidate removed.' });
    } catch (e) {
        console.error('admin delete candidate error:', e.message);
        res.status(500).json({ success: false, message: 'Could not delete candidate.' });
    }
});

// Raw audit rows only (voter_id, action, timestamp) – no biometric data exists in this table.
router.get('/audit-logs', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, voter_id, action, timestamp FROM audit_log ORDER BY id DESC LIMIT 200");
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

module.exports = router;
