const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ai = require('../config/ai');
const audit = require('../config/audit');
const tokens = require('../config/tokens');
const election = require('../config/election');
const requireAdmin = require('../middleware/requireAdmin');
const rateLimit = require('../middleware/rateLimit');

const publicElection = e => e && ({ election_id: e.election_id, name: e.name, status: e.effective_status, open: e.open, start_time: e.start_time, end_time: e.end_time });

// Public: the voter UI shows whether voting is open and when.
router.get('/election', async (req, res) => {
    try { res.json(publicElection(await election.current()) || { status: 'DRAFT', open: false }); }
    catch (e) { console.error('election error:', e.message); res.status(500).json({ success: false, message: 'Could not load election' }); }
});

// Public: active candidates only, WITHOUT running tallies.
router.get('/candidates', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT candidate_id, name, party, symbol, description FROM candidates WHERE is_active = TRUE ORDER BY candidate_id");
        res.json(rows);
    } catch (e) { console.error('candidates error:', e.message); res.status(500).json({ success: false, message: 'Could not load candidates' }); }
});

// Cast a vote. WHO is voting comes only from the server-issued session token that /voters/authenticate
// returns after a face match – a voter_id in the body is ignored.
router.post('/cast', rateLimit('cast', 20, 10 * 60 * 1000), async (req, res) => {
    const voter_id = tokens.verify('voter', tokens.bearer(req));
    if (!voter_id) return res.status(401).json({ success: false, code: 'VOTER_SESSION', message: 'Your verification has expired. Please log in with face verification again.' });
    const candidate_id = Number(req.body?.candidate_id);
    try {
        const e = await election.current();
        if (!e || !e.open) return res.status(403).json({ success: false, code: 'VOTING_CLOSED', message: 'Voting is currently closed.' });

        const [voter] = await db.query("SELECT has_voted, is_eligible FROM voters WHERE voter_id = ?", [voter_id]);
        if (voter.length === 0) return res.status(404).json({ success: false, message: 'Voter not found' });
        if (!voter[0].is_eligible) return res.status(403).json({ success: false, code: 'NOT_ELIGIBLE', message: 'This voter is not eligible to vote.' });
        if (voter[0].has_voted) return res.status(409).json({ success: false, code: 'ALREADY_VOTED', message: 'Already voted!' });
        if (!Number.isInteger(candidate_id)) return res.status(400).json({ success: false, code: 'CANDIDATE_INVALID', message: 'Select a candidate.' });
        const [candidate] = await db.query("SELECT candidate_id, name FROM candidates WHERE candidate_id = ? AND is_active = TRUE", [candidate_id]);
        if (candidate.length === 0) return res.status(404).json({ success: false, code: 'CANDIDATE_INVALID', message: 'Candidate not found' });

        // Atomically claim the voter's single vote: only one concurrent request can flip has_voted FALSE -> TRUE.
        const [claim] = await db.query("UPDATE voters SET has_voted = TRUE WHERE voter_id = ? AND has_voted = FALSE", [voter_id]);
        if (claim.affectedRows !== 1) return res.status(409).json({ success: false, code: 'ALREADY_VOTED', message: 'Already voted!' });
        const release = () => db.query("UPDATE voters SET has_voted = FALSE WHERE voter_id = ?", [voter_id]);
        let blockRes;
        try { blockRes = await ai.post('/add-to-blockchain', { voter_id, candidate: candidate[0].name }); }
        catch (err) { await release(); throw err; }
        if (blockRes.status !== 200 || !blockRes.data.success) {
            await release();
            return res.status(502).json({ success: false, code: 'CHAIN_ERROR', message: 'Could not record vote on blockchain' });
        }
        await db.query("UPDATE candidates SET vote_count = vote_count + 1 WHERE candidate_id = ?", [candidate_id]);
        await audit(voter_id, 'VOTED');   // the chosen candidate is deliberately NOT written next to the voter id
        res.json({
            success: true, message: `Vote cast for ${candidate[0].name}`,
            block_hash: blockRes.data.block_hash, voter_hash: blockRes.data.voter_hash, block_index: blockRes.data.block_index
        });
    } catch (e) {
        console.error('cast error:', e.message);
        res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Could not cast vote. Please try again.' });
    }
});

router.get('/results', requireAdmin, async (req, res) => {
    try {
        const [candidates] = await db.query("SELECT candidate_id, name, party, symbol, description, is_active, vote_count FROM candidates ORDER BY vote_count DESC, candidate_id");
        const [[{ total }]] = await db.query("SELECT COUNT(*) as total FROM voters WHERE has_voted = TRUE");
        const [[{ registered }]] = await db.query("SELECT COUNT(*) as registered FROM voters");
        let blockchain = null;
        try { const b = await ai.get('/blockchain-status'); if (b.status === 200) blockchain = b.data; } catch { /* AI service down */ }
        const e = await election.current();
        res.json({ candidates, total_votes: total, total_registered: registered, blockchain, election: publicElection(e) });
    } catch (e) {
        console.error('results error:', e.message);
        res.status(500).json({ success: false, message: 'Could not load results' });
    }
});

module.exports = router;
