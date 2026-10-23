// Admin: dashboard statistics, audit-log browser and voter constituency assignment. All behind requireAdmin.
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ai = require('../config/ai');
const audit = require('../config/audit');
const election = require('../config/election');
const requireAdmin = require('../middleware/requireAdmin');
const { tally } = require('../config/stats');

const oops = (res, tag, e, msg) => { console.error(`${tag}:`, e.message); res.status(500).json({ success: false, message: msg }); };

router.get('/dashboard-stats', requireAdmin, async (req, res) => {
    try {
        const [[v]] = await db.query(`SELECT COUNT(*) registered, COALESCE(SUM(is_eligible),0) eligible, COALESCE(SUM(face_encoding IS NOT NULL),0) face_registered,
            COALESCE(SUM(has_voted),0) voted, COALESCE(SUM(is_eligible AND NOT has_voted),0) remaining, COALESCE(SUM(constituency_id IS NULL),0) no_constituency FROM voters`).then(([x]) => [x]);
        const t = await tally();
        const [[c]] = await db.query(`SELECT COUNT(*) total, COALESCE(SUM(is_active),0) active, COALESCE(SUM(party_id IS NULL OR constituency_id IS NULL),0) unassigned FROM candidates`).then(([x]) => [x]);
        const [[a]] = await db.query(`SELECT COUNT(*) total, COALESCE(SUM(DATE(timestamp) = CURDATE()),0) today, COALESCE(SUM(status='FAILED'),0) failed, COALESCE(SUM(status='DENIED'),0) denied FROM audit_log`).then(([x]) => [x]);
        const [recent] = await db.query("SELECT id, voter_id, actor, action, event_type, status, details, timestamp FROM audit_log ORDER BY id DESC LIMIT 8");
        const e = await election.current();

        let blockchain = { available: false };
        try {
            const b = await ai.get('/blockchain-status');
            if (b.status === 200) blockchain = { available: true, is_valid: b.data.is_valid, total_blocks: b.data.total_blocks, vote_blocks: Math.max(b.data.total_blocks - 1, 0) };
        } catch { /* AI service down: the dashboard still loads */ }

        const eligible = Number(v.eligible), voted = Number(v.voted);
        res.json({
            election: e ? { name: e.name, status: e.effective_status, type: e.election_type, open: e.open, start_time: e.start_time, end_time: e.end_time } : null,
            voters: { registered: Number(v.registered), eligible, face_registered: Number(v.face_registered), voted, remaining_eligible: Number(v.remaining),
                turnout_percent: eligible ? Math.round((voted / eligible) * 1000) / 10 : 0, without_constituency: Number(v.no_constituency) },
            candidates: { total: Number(c.total), active: Number(c.active), unassigned: Number(c.unassigned) },
            votes: { total: t.total_votes, voters_marked_voted: voted, consistent: t.total_votes === voted },
            by_candidate: t.candidates.filter(x => x.is_active || x.votes > 0),
            by_party: t.by_party,
            audit: { total: Number(a.total), today: Number(a.today), failed: Number(a.failed), denied: Number(a.denied) },
            recent_activity: recent.map(shapeAudit),
            blockchain
        });
    } catch (e) { oops(res, 'dashboard-stats', e, 'Could not load dashboard data'); }
});

// ---------------------------------------------------------------- audit log
const shapeAudit = r => ({ id: r.id, event_type: r.event_type || String(r.action).split(':')[0], user_id: r.voter_id || r.actor, role: r.actor,
    timestamp: r.timestamp, status: r.status || 'SUCCESS', details: r.details || null });

router.get('/audit-logs', requireAdmin, async (req, res) => {
    try {
        const q = req.query, where = [], p = [];
        if (q.q && String(q.q).trim()) { where.push('COALESCE(voter_id, actor) LIKE ?'); p.push(`%${String(q.q).trim().replace(/[%_]/g, '')}%`); }
        if (q.event) { where.push('event_type = ?'); p.push(String(q.event)); }
        if (q.role) { where.push('actor = ?'); p.push(String(q.role)); }
        if (q.status && ['SUCCESS', 'FAILED', 'DENIED'].includes(String(q.status).toUpperCase())) { where.push('status = ?'); p.push(String(q.status).toUpperCase()); }
        const day = s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null);
        if (day(q.from)) { where.push('timestamp >= ?'); p.push(`${day(q.from)} 00:00:00`); }
        if (day(q.to)) { where.push('timestamp < DATE_ADD(?, INTERVAL 1 DAY)'); p.push(day(q.to)); }
        const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const size = Math.min(Math.max(parseInt(q.page_size, 10) || 25, 5), 100);
        const [[{ n }]] = await db.query(`SELECT COUNT(*) n FROM audit_log ${W}`, p).then(([x]) => [x]);
        const pages = Math.max(Math.ceil(n / size), 1);
        const page = Math.min(Math.max(parseInt(q.page, 10) || 1, 1), pages);
        const [rows] = await db.query(`SELECT id, voter_id, actor, action, event_type, status, details, timestamp FROM audit_log ${W} ORDER BY id DESC LIMIT ? OFFSET ?`, [...p, size, (page - 1) * size]);
        const [[s]] = await db.query(`SELECT COUNT(*) total, COALESCE(SUM(actor='voter'),0) voter, COALESCE(SUM(actor='admin'),0) admin,
            COALESCE(SUM(status='FAILED'),0) failed, COALESCE(SUM(status='DENIED'),0) denied FROM audit_log`).then(([x]) => [x]);
        const [types] = await db.query("SELECT DISTINCT event_type FROM audit_log WHERE event_type IS NOT NULL ORDER BY event_type");
        res.json({ rows: rows.map(shapeAudit), total: n, page, pages, page_size: size,
            summary: { total: Number(s.total), voter: Number(s.voter), admin: Number(s.admin), failed: Number(s.failed), denied: Number(s.denied) },
            event_types: types.map(t => t.event_type) });
    } catch (e) { oops(res, 'audit-logs', e, 'Could not load audit logs'); }
});

// ---------------------------------------------------------------- voter constituency
// A voter's constituency is declared at registration or set here by an administrator. It is never guessed.
router.put('/voters/:id/constituency', requireAdmin, async (req, res) => {
    try {
        const voter_id = String(req.params.id).trim().toUpperCase();
        const constituency_id = Number(req.body?.constituency_id);
        if (!Number.isInteger(constituency_id) || constituency_id <= 0) return res.status(400).json({ success: false, code: 'CONSTITUENCY_REQUIRED', message: 'Select a constituency.' });
        const [[v]] = await db.query('SELECT has_voted FROM voters WHERE voter_id = ?', [voter_id]).then(([x]) => [x]);
        if (!v) return res.status(404).json({ success: false, message: 'Voter not found' });
        if (v.has_voted) return res.status(409).json({ success: false, code: 'ALREADY_VOTED', message: 'This voter has already voted; their constituency can no longer be changed.' });
        const [[k]] = await db.query('SELECT state_id, is_active FROM constituencies WHERE constituency_id = ?', [constituency_id]).then(([x]) => [x]);
        if (!k || !k.is_active) return res.status(404).json({ success: false, code: 'CONSTITUENCY_UNKNOWN', message: 'Unknown or inactive constituency.' });
        await db.query('UPDATE voters SET state_id = ?, constituency_id = ? WHERE voter_id = ?', [k.state_id, constituency_id, voter_id]);
        await audit(voter_id, `VOTER_CONSTITUENCY_SET:${constituency_id}`, 'admin');
        res.json({ success: true });
    } catch (e) { oops(res, 'set voter constituency', e, 'Could not update voter'); }
});

module.exports = router;
