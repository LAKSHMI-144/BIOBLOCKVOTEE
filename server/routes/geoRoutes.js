// Public, read-only master data the registration form needs (states and constituencies). No personal data.
const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/states', async (req, res) => {
    try { const [r] = await db.query('SELECT state_id, code, name, kind FROM states ORDER BY name'); res.json(r); }
    catch (e) { console.error('geo states:', e.message); res.status(500).json({ success: false, message: 'Could not load states' }); }
});
router.get('/constituencies', async (req, res) => {
    try {
        const state_id = Number(req.query.state_id);
        if (!Number.isInteger(state_id) || state_id <= 0) return res.status(400).json({ success: false, message: 'state_id is required' });
        const [r] = await db.query('SELECT constituency_id, name, kind FROM constituencies WHERE state_id = ? AND is_active ORDER BY name', [state_id]);
        res.json(r);
    } catch (e) { console.error('geo constituencies:', e.message); res.status(500).json({ success: false, message: 'Could not load constituencies' }); }
});
module.exports = router;
