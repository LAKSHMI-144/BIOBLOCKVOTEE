const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ai = require('../config/ai');
const requireAdmin = require('../middleware/requireAdmin');

router.post('/cast', async (req, res) => {
    const { voter_id, candidate_id } = req.body;
    try {
        const [voter] = await db.query("SELECT * FROM voters WHERE voter_id = ?", [voter_id]);
        if (voter.length === 0) return res.json({ success: false, message: "Voter not found" });
        if (voter[0].has_voted) return res.json({ success: false, message: "Already voted!" });
        const [candidate] = await db.query("SELECT * FROM candidates WHERE candidate_id = ?", [candidate_id]);
        if (candidate.length === 0) return res.json({ success: false, message: "Candidate not found" });
        // Atomically claim the voter's single vote. Only one concurrent request can flip
        // has_voted FALSE -> TRUE, so parallel requests cannot create extra votes/blocks.
        const [claim] = await db.query(
            "UPDATE voters SET has_voted = TRUE WHERE voter_id = ? AND has_voted = FALSE", [voter_id]);
        if (claim.affectedRows !== 1) return res.json({ success: false, message: "Already voted!" });
        let blockRes;
        try {
            blockRes = await ai.post('/add-to-blockchain', { voter_id, candidate: candidate[0].name });
        } catch (err) {
            await db.query("UPDATE voters SET has_voted = FALSE WHERE voter_id = ?", [voter_id]);
            throw err;
        }
        if (blockRes.status !== 200 || !blockRes.data.success) {
            await db.query("UPDATE voters SET has_voted = FALSE WHERE voter_id = ?", [voter_id]);
            return res.json({ success: false, message: "Could not record vote on blockchain" });
        }
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

router.get('/results', requireAdmin, async (req, res) => {
    const [candidates] = await db.query("SELECT * FROM candidates ORDER BY vote_count DESC");
    const [[{ total }]] = await db.query("SELECT COUNT(*) as total FROM voters WHERE has_voted = TRUE");
    const [[{ registered }]] = await db.query("SELECT COUNT(*) as registered FROM voters");
    const blockRes = await ai.get('/blockchain-status');
    res.json({ candidates, total_votes: total, total_registered: registered, blockchain: blockRes.data });
});

module.exports = router;
