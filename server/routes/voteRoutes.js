const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const ai = require('../config/ai');

const PYTHON = process.env.PYTHON_AI_URL || 'http://localhost:5001';

router.post('/cast', async (req, res) => {
    const { voter_id, candidate_id } = req.body;
    try {
        const [voter] = await db.query("SELECT * FROM voters WHERE voter_id = ?", [voter_id]);
        if (voter.length === 0) return res.json({ success: false, message: "Voter not found" });
        if (voter[0].has_voted) return res.json({ success: false, message: "Already voted!" });
        const [candidate] = await db.query("SELECT * FROM candidates WHERE candidate_id = ?", [candidate_id]);
        if (candidate.length === 0) return res.json({ success: false, message: "Candidate not found" });
        const blockRes = await ai.post('/add-to-blockchain', {
            voter_id, candidate: candidate[0].name
        });
        if (blockRes.status !== 200 || !blockRes.data.success) return res.json({ success: false, message: "Could not record vote on blockchain" });
        await db.query("UPDATE voters SET has_voted = TRUE WHERE voter_id = ?", [voter_id]);
        await db.query("UPDATE candidates SET vote_count = vote_count + 1 WHERE candidate_id = ?", [candidate_id]);
        await db.query("INSERT INTO audit_log (voter_id, action) VALUES (?, ?)",
            [voter_id, `VOTED_FOR:${candidate[0].name}`]);
        res.json({
            success: true,
            message: `Vote cast for ${candidate[0].name}`,
            block_hash: blockRes.data.block_hash,
            voter_hash: blockRes.data.voter_hash,
            block_index: blockRes.data.block_index
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

router.get('/candidates', async (req, res) => {
    const [rows] = await db.query("SELECT * FROM candidates");
    res.json(rows);
});

router.get('/results', async (req, res) => {
    const [candidates] = await db.query("SELECT * FROM candidates ORDER BY vote_count DESC");
    const [[{ total }]] = await db.query("SELECT COUNT(*) as total FROM voters WHERE has_voted = TRUE");
    const [[{ registered }]] = await db.query("SELECT COUNT(*) as registered FROM voters");
    const blockRes = await axios.get(`${PYTHON}/blockchain-status`);
    res.json({ candidates, total_votes: total, total_registered: registered, blockchain: blockRes.data });
});

module.exports = router;
