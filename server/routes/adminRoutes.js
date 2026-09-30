const express = require('express');
const router = express.Router();
const db = require('../config/db');
const requireAdmin = require('../middleware/requireAdmin');
const { configured, checkCredentials, signToken, TTL_MS } = require('../config/adminAuth');

// Basic brute-force protection: 5 failed logins per IP per 15 minutes.
const fails = new Map();
const WINDOW = 15 * 60 * 1000;
const recent = ip => (fails.get(ip) || []).filter(t => Date.now() - t < WINDOW);

router.post('/login', (req, res) => {
    if (!configured()) return res.status(503).json({ success: false, message: 'Admin login is not configured on the server' });
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
        const [rows] = await db.query("SELECT id, voter_id, action, timestamp FROM audit_log ORDER BY id DESC LIMIT 200");
        // Ballot secrecy: the vote event stores the chosen candidate; never reveal who voted for whom.
        res.json(rows.map(r => ({ ...r, action: r.action.startsWith('VOTED_FOR:') ? 'VOTED_FOR' : r.action })));
    } catch (e) {
        console.error('audit-logs error:', e.message);
        res.status(500).json({ success: false, message: 'Could not load audit logs' });
    }
});

module.exports = router;
