const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ai = require('../config/ai');
const audit = require('../config/audit');
const tokens = require('../config/tokens');
const election = require('../config/election');
const requireAdmin = require('../middleware/requireAdmin');
const { tally } = require('../config/stats');
const rateLimit = require('../middleware/rateLimit');

const publicElection = e => e && ({ election_id: e.election_id, name: e.name, status: e.effective_status, open: e.open, start_time: e.start_time, end_time: e.end_time, type: e.election_type });

// Public: the voter UI shows whether voting is open and when.
router.get('/election', async (req, res) => {
    try { res.json(publicElection(await election.current()) || { status: 'DRAFT', open: false }); }
    catch (e) { console.error('election error:', e.message); res.status(500).json({ success: false, message: 'Could not load election' }); }
});

// The ballot for ONE voter: active candidates of the current election in the voter's own constituency.
// Needs the session token issued after face verification; a voter never sees other constituencies' candidates.
const BALLOT_WHERE = `c.election_id = ? AND c.constituency_id = ? AND c.is_active = TRUE AND c.party_id IS NOT NULL AND p.status = 'ACTIVE'`;
router.get('/candidates', async (req, res) => {
    const voter_id = tokens.verify('voter', tokens.bearer(req));
    if (!voter_id) return res.status(401).json({ success: false, code: 'VOTER_SESSION', message: 'Your verification has expired. Please log in with face verification again.' });
    try {
        const [[v]] = await db.query(`SELECT v.constituency_id, k.name AS constituency_name, s.name AS state_name FROM voters v
            LEFT JOIN constituencies k ON k.constituency_id = v.constituency_id LEFT JOIN states s ON s.state_id = k.state_id WHERE v.voter_id = ?`, [voter_id]).then(([x]) => [x]);
        if (!v) return res.status(404).json({ success: false, message: 'Voter not found' });
        const e = await election.current();
        if (!v.constituency_id) return res.status(409).json({ success: false, code: 'NO_CONSTITUENCY', message: 'Your constituency has not been set, so no ballot can be shown. Please contact an election administrator.', election: publicElection(e) });
        const [rows] = await db.query(`SELECT c.candidate_id, c.name, c.symbol, c.description, c.position, p.name AS party, p.abbreviation AS party_abbr
            FROM candidates c JOIN parties p ON p.party_id = c.party_id WHERE ${BALLOT_WHERE} ORDER BY c.name`, [e?.election_id ?? 0, v.constituency_id]);
        res.json({ election: publicElection(e), constituency: { name: v.constituency_name, state: v.state_name }, candidates: rows });
    } catch (e) { console.error('candidates error:', e.message); res.status(500).json({ success: false, message: 'Could not load candidates' }); }
});

// Cast a vote. WHO is voting comes only from the server-issued session token that /voters/authenticate
// returns after a face match – a voter_id in the body is ignored.
// One-person-one-vote: the claim (has_voted FALSE -> TRUE) and the tally increment happen in ONE transaction, and
// only the request that flips the flag (affectedRows = 1) proceeds. If the ledger write then fails, the claim is undone.
router.post('/cast', rateLimit('cast', 20, 10 * 60 * 1000), async (req, res) => {
    const voter_id = tokens.verify('voter', tokens.bearer(req));
    if (!voter_id) return res.status(401).json({ success: false, code: 'VOTER_SESSION', message: 'Your verification has expired. Please log in with face verification again.' });
    const candidate_id = Number(req.body?.candidate_id);
    const deny = async (status, code, message, event) => { await audit(voter_id, event || `VOTE_DENIED:${code}`); return res.status(status).json({ success: false, code, message }); };
    let conn;
    try {
        const e = await election.current();
        if (!e || !e.open) return deny(403, 'VOTING_CLOSED', 'Voting is currently closed.');

        const [voter] = await db.query("SELECT has_voted, is_eligible, constituency_id FROM voters WHERE voter_id = ?", [voter_id]);
        if (voter.length === 0) return res.status(404).json({ success: false, message: 'Voter not found' });
        if (!voter[0].is_eligible) return deny(403, 'NOT_ELIGIBLE', 'This voter is not eligible to vote.');
        if (voter[0].has_voted) return deny(409, 'ALREADY_VOTED', 'Already voted!', 'DUPLICATE_ATTEMPT');
        if (!voter[0].constituency_id) return deny(409, 'NO_CONSTITUENCY', 'Your constituency has not been set. Please contact an election administrator.');
        if (!Number.isInteger(candidate_id)) return res.status(400).json({ success: false, code: 'CANDIDATE_INVALID', message: 'Select a candidate.' });
        // Enforced on the server: the candidate must be on THIS voter's ballot (election, constituency, active, active party).
        const [candidate] = await db.query(`SELECT c.candidate_id, c.name FROM candidates c JOIN parties p ON p.party_id = c.party_id
            WHERE c.candidate_id = ? AND ${BALLOT_WHERE}`, [candidate_id, e.election_id, voter[0].constituency_id]);
        if (candidate.length === 0) return deny(404, 'CANDIDATE_INVALID', 'That candidate is not on your ballot.');

        conn = await db.getConnection();
        await conn.beginTransaction();
        const [claim] = await conn.query("UPDATE voters SET has_voted = TRUE WHERE voter_id = ? AND has_voted = FALSE AND is_eligible = TRUE", [voter_id]);
        if (claim.affectedRows !== 1) { await conn.rollback(); return deny(409, 'ALREADY_VOTED', 'Already voted!', 'DUPLICATE_ATTEMPT'); }
        const [tallyUp] = await conn.query("UPDATE candidates SET vote_count = vote_count + 1 WHERE candidate_id = ? AND is_active = TRUE", [candidate_id]);
        if (tallyUp.affectedRows !== 1) { await conn.rollback(); return deny(404, 'CANDIDATE_INVALID', 'That candidate is not on your ballot.'); }
        await conn.commit();

        const undo = async why => {
            try {
                await conn.beginTransaction();
                await conn.query("UPDATE voters SET has_voted = FALSE WHERE voter_id = ?", [voter_id]);
                await conn.query("UPDATE candidates SET vote_count = GREATEST(vote_count - 1, 0) WHERE candidate_id = ?", [candidate_id]);
                await conn.commit();
            } catch (err) { await conn.rollback().catch(() => {}); console.error('CRITICAL: could not undo vote claim for a failed chain write:', err.message); }
            await audit(voter_id, `VOTE_FAILED:${why}`);
        };
        let blockRes;
        try { blockRes = await ai.post('/add-to-blockchain', { voter_id, candidate: candidate[0].name }); }
        catch (err) { await undo('CHAIN_UNAVAILABLE'); console.error('blockchain write failed:', err.message); return res.status(502).json({ success: false, code: 'CHAIN_ERROR', message: 'Could not record vote on blockchain. Your vote was not counted; please try again.' }); }
        if (blockRes.status !== 200 || !blockRes.data.success) {
            await undo('CHAIN_ERROR');
            return res.status(502).json({ success: false, code: 'CHAIN_ERROR', message: 'Could not record vote on blockchain. Your vote was not counted; please try again.' });
        }
        await audit(voter_id, 'VOTED');   // the chosen candidate is deliberately NOT written next to the voter id
        res.json({
            success: true, message: `Vote cast for ${candidate[0].name}`,
            block_hash: blockRes.data.block_hash, voter_hash: blockRes.data.voter_hash, block_index: blockRes.data.block_index
        });
    } catch (e) {
        if (conn) await conn.rollback().catch(() => {});
        console.error('cast error:', e.message);
        res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Could not cast vote. Please try again.' });
    } finally { if (conn) conn.release(); }
});

router.get('/results', requireAdmin, async (req, res) => {
    try {
        const t = await tally();
        const [[{ voted }]] = await db.query("SELECT COUNT(*) AS voted FROM voters WHERE has_voted = TRUE").then(([x]) => [x]);
        const [[{ registered }]] = await db.query("SELECT COUNT(*) as registered FROM voters").then(([x]) => [x]);
        let blockchain = null;
        try { const b = await ai.get('/blockchain-status'); if (b.status === 200) blockchain = { is_valid: b.data.is_valid, total_blocks: b.data.total_blocks }; } catch { /* AI service down */ }
        const e = await election.current();
        await audit(null, 'RESULTS_VIEWED', 'admin');
        res.json({ candidates: t.candidates.map(c => ({ ...c, vote_count: c.votes })), by_party: t.by_party, total_votes: t.total_votes, voters_marked_voted: voted,
            total_registered: registered, blockchain, election: publicElection(e) });
    } catch (e) {
        console.error('results error:', e.message);
        res.status(500).json({ success: false, message: 'Could not load results' });
    }
});

module.exports = router;
