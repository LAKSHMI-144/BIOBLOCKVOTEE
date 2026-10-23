// Admin: constituencies, parties and candidates. Everything here is behind requireAdmin and every change is audited.
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const audit = require('../config/audit');
const election = require('../config/election');
const requireAdmin = require('../middleware/requireAdmin');

const bad = (res, errors, status = 400) => { const f = Object.values(errors)[0]; return res.status(status).json({ success: false, code: f.code, message: f.message, errors }); };
const oops = (res, tag, e, msg) => { console.error(`${tag}:`, e.message); res.status(500).json({ success: false, message: msg }); };
const intOrNull = v => (v === undefined || v === null || v === '' ? null : Number(v));
const isId = v => Number.isInteger(v) && v > 0;

// ---------------------------------------------------------------- geography
router.get('/states', requireAdmin, async (req, res) => {
    try {
        const [r] = await db.query(`SELECT s.state_id, s.code, s.name, s.kind, COUNT(c.constituency_id) AS constituencies
            FROM states s LEFT JOIN constituencies c ON c.state_id = s.state_id AND c.is_active GROUP BY s.state_id ORDER BY s.name`);
        res.json(r);
    } catch (e) { oops(res, 'admin states', e, 'Could not load states'); }
});

router.get('/constituencies', requireAdmin, async (req, res) => {
    try {
        const where = [], p = [];
        if (isId(Number(req.query.state_id))) { where.push('c.state_id = ?'); p.push(Number(req.query.state_id)); }
        const [r] = await db.query(`SELECT c.constituency_id, c.name, c.kind, c.is_active, c.state_id, s.name AS state_name
            FROM constituencies c JOIN states s ON s.state_id = c.state_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.name, c.name`, p);
        res.json(r);
    } catch (e) { oops(res, 'admin constituencies', e, 'Could not load constituencies'); }
});

router.post('/constituencies', requireAdmin, async (req, res) => {
    try {
        const state_id = Number(req.body?.state_id), name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
        const kind = String(req.body?.kind ?? 'PARLIAMENTARY').toUpperCase();
        const errors = {};
        if (!isId(state_id)) errors.state_id = { code: 'STATE_REQUIRED', message: 'Select a state or union territory.' };
        if (name.length < 2 || name.length > 100) errors.name = { code: 'NAME_INVALID', message: 'Constituency name must be 2-100 characters.' };
        if (!['PARLIAMENTARY', 'ASSEMBLY'].includes(kind)) errors.kind = { code: 'KIND_INVALID', message: 'Type must be Parliamentary or Assembly.' };
        if (Object.keys(errors).length) return bad(res, errors);
        const [[st]] = await db.query('SELECT state_id FROM states WHERE state_id = ?', [state_id]).then(([r]) => [r]);
        if (!st) return bad(res, { state_id: { code: 'STATE_UNKNOWN', message: 'Unknown state.' } }, 404);
        try {
            const [r] = await db.query('INSERT INTO constituencies (state_id, name, kind) VALUES (?,?,?)', [state_id, name, kind]);
            await audit(null, `CONSTITUENCY_CREATED:${r.insertId}`, 'admin');
            res.status(201).json({ success: true, constituency_id: r.insertId });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return bad(res, { name: { code: 'DUPLICATE', message: 'This constituency already exists in that state.' } }, 409);
            throw e;
        }
    } catch (e) { oops(res, 'add constituency', e, 'Could not add constituency'); }
});

// ---------------------------------------------------------------- parties
const partySelect = `SELECT p.party_id, p.name, p.abbreviation, p.all_states, p.status, p.notes,
        (SELECT GROUP_CONCAT(ps.state_id) FROM party_states ps WHERE ps.party_id = p.party_id) AS state_ids,
        (SELECT COUNT(*) FROM candidates c WHERE c.party_id = p.party_id) AS candidates FROM parties p`;
const shapeParty = r => ({ ...r, all_states: !!r.all_states, state_ids: r.state_ids ? r.state_ids.split(',').map(Number) : [] });

router.get('/parties', requireAdmin, async (req, res) => {
    try {
        const where = [], p = [];
        if (req.query.status) { where.push('p.status = ?'); p.push(String(req.query.status).toUpperCase()); }
        const sid = Number(req.query.state_id);
        if (isId(sid)) { where.push('(p.all_states OR EXISTS (SELECT 1 FROM party_states ps WHERE ps.party_id = p.party_id AND ps.state_id = ?))'); p.push(sid); }
        const [r] = await db.query(`${partySelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.all_states DESC, p.name`, p);
        res.json(r.map(shapeParty));
    } catch (e) { oops(res, 'admin parties', e, 'Could not load parties'); }
});

function cleanParty(b) {
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' '), abbreviation = String(b.abbreviation ?? '').trim();
    const notes = String(b.notes ?? '').trim();
    const all_states = b.all_states === true;
    const state_ids = Array.isArray(b.state_ids) ? [...new Set(b.state_ids.map(Number))] : [];
    const errors = {};
    if (name.length < 2 || name.length > 150) errors.name = { code: 'NAME_INVALID', message: 'Party name must be 2-150 characters.' };
    if (abbreviation.length < 2 || abbreviation.length > 20) errors.abbreviation = { code: 'ABBR_INVALID', message: 'Abbreviation must be 2-20 characters.' };
    if (notes.length > 250) errors.notes = { code: 'NOTES_LONG', message: 'Notes must be at most 250 characters.' };
    if (!all_states && (state_ids.length === 0 || !state_ids.every(isId))) errors.state_ids = { code: 'STATES_REQUIRED', message: 'Choose the states this party contests in, or mark it as contesting everywhere.' };
    return { name, abbreviation, notes: notes || null, all_states, state_ids: all_states ? [] : state_ids, errors };
}
async function saveStates(conn, party_id, ids) {
    await conn.query('DELETE FROM party_states WHERE party_id = ?', [party_id]);
    for (const sid of ids) await conn.query('INSERT INTO party_states (party_id, state_id) VALUES (?,?)', [party_id, sid]);
}
const dupParty = res => bad(res, { name: { code: 'DUPLICATE', message: 'A party with this name or abbreviation already exists.' } }, 409);

router.post('/parties', requireAdmin, async (req, res) => {
    const p = cleanParty(req.body || {});
    if (Object.keys(p.errors).length) return bad(res, p.errors);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [r] = await conn.query('INSERT INTO parties (name, abbreviation, all_states, notes) VALUES (?,?,?,?)', [p.name, p.abbreviation, p.all_states, p.notes]);
        await saveStates(conn, r.insertId, p.state_ids);
        await conn.commit();
        await audit(null, `PARTY_CREATED:${r.insertId}`, 'admin');
        res.status(201).json({ success: true, party_id: r.insertId });
    } catch (e) {
        await conn.rollback().catch(() => {});
        if (e.code === 'ER_DUP_ENTRY') return dupParty(res);
        if (e.code === 'ER_NO_REFERENCED_ROW_2') return bad(res, { state_ids: { code: 'STATE_UNKNOWN', message: 'Unknown state selected.' } });
        oops(res, 'add party', e, 'Could not add party');
    } finally { conn.release(); }
});

router.put('/parties/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const p = cleanParty(req.body || {});
    if (Object.keys(p.errors).length) return bad(res, p.errors);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [r] = await conn.query('UPDATE parties SET name=?, abbreviation=?, all_states=?, notes=? WHERE party_id=?', [p.name, p.abbreviation, p.all_states, p.notes, id]);
        const [[exists]] = await conn.query('SELECT party_id FROM parties WHERE party_id = ?', [id]).then(([x]) => [x]);
        if (!exists) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Party not found' }); }
        await saveStates(conn, id, p.state_ids);
        await conn.commit();
        await audit(null, `PARTY_UPDATED:${id}`, 'admin');
        res.json({ success: true, changed: r.changedRows });
    } catch (e) {
        await conn.rollback().catch(() => {});
        if (e.code === 'ER_DUP_ENTRY') return dupParty(res);
        if (e.code === 'ER_NO_REFERENCED_ROW_2') return bad(res, { state_ids: { code: 'STATE_UNKNOWN', message: 'Unknown state selected.' } });
        oops(res, 'edit party', e, 'Could not update party');
    } finally { conn.release(); }
});

router.post('/parties/:id/active', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id), active = req.body?.active === true;
        const [r] = await db.query('UPDATE parties SET status = ? WHERE party_id = ?', [active ? 'ACTIVE' : 'INACTIVE', id]);
        if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Party not found' });
        await audit(null, `PARTY_${active ? 'ACTIVATED' : 'DEACTIVATED'}:${id}`, 'admin');
        res.json({ success: true });
    } catch (e) { oops(res, 'party active', e, 'Could not update party'); }
});

// ---------------------------------------------------------------- candidates
const candidateSelect = `SELECT c.candidate_id, c.name, c.symbol, c.description, c.position, c.is_active, c.vote_count,
        c.election_id, e.name AS election_name, c.party_id, p.name AS party_name, p.abbreviation AS party_abbr, c.party AS party_legacy,
        c.constituency_id, k.name AS constituency_name, k.kind AS constituency_kind, k.state_id, s.name AS state_name
    FROM candidates c
    LEFT JOIN elections e ON e.election_id = c.election_id
    LEFT JOIN parties p ON p.party_id = c.party_id
    LEFT JOIN constituencies k ON k.constituency_id = c.constituency_id
    LEFT JOIN states s ON s.state_id = k.state_id`;
const shapeCandidate = r => ({ ...r, is_active: !!r.is_active, status: r.is_active ? 'ACTIVE' : 'INACTIVE', has_votes: Number(r.vote_count) > 0,
    assigned: !!(r.party_id && r.constituency_id) });

router.get('/candidates', requireAdmin, async (req, res) => {
    try {
        const q = req.query, where = [], p = [];
        for (const [k, col] of [['election_id', 'c.election_id'], ['state_id', 'k.state_id'], ['constituency_id', 'c.constituency_id'], ['party_id', 'c.party_id']])
            if (isId(Number(q[k]))) { where.push(`${col} = ?`); p.push(Number(q[k])); }
        if (q.status) { where.push('c.is_active = ?'); p.push(String(q.status).toUpperCase() === 'ACTIVE'); }
        if (q.q) { where.push('c.name LIKE ?'); p.push(`%${String(q.q).trim().replace(/[%_]/g, '')}%`); }
        const [r] = await db.query(`${candidateSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.name, k.name, c.name, c.candidate_id`, p);
        res.json(r.map(shapeCandidate));
    } catch (e) { oops(res, 'admin candidates', e, 'Could not load candidates'); }
});

router.get('/candidates/:id', requireAdmin, async (req, res) => {
    try {
        const [r] = await db.query(`${candidateSelect} WHERE c.candidate_id = ?`, [Number(req.params.id)]);
        if (!r.length) return res.status(404).json({ success: false, message: 'Candidate not found' });
        res.json(shapeCandidate(r[0]));
    } catch (e) { oops(res, 'admin candidate', e, 'Could not load candidate'); }
});

// Candidates cannot be added/edited while voting is open or after it ended. (Activation is handled separately.)
const lockedState = async () => { const e = await election.current(); return e && ['ACTIVE', 'ENDED'].includes(e.effective_status) ? e.effective_status : null; };
const lockedMsg = s => ({ success: false, code: 'ELECTION_LOCKED', message: `Candidates cannot be added or edited while the election is ${s}.` });

function cleanCandidate(b) {
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' '), symbol = String(b.symbol ?? '').trim();
    const description = String(b.description ?? '').trim(), position = String(b.position ?? '').trim();
    const errors = {};
    if (name.length < 2 || name.length > 100) errors.name = { code: 'NAME_INVALID', message: 'Candidate name must be 2-100 characters.' };
    if ([...symbol].length > 4) errors.symbol = { code: 'SYMBOL_INVALID', message: 'Symbol must be at most 4 characters.' };
    if (description.length > 500) errors.description = { code: 'DESC_LONG', message: 'Description must be at most 500 characters.' };
    if (position.length > 100) errors.position = { code: 'POSITION_LONG', message: 'Position must be at most 100 characters.' };
    return { name, symbol: symbol || null, description: description || null, position: position || null,
        party_id: intOrNull(b.party_id), constituency_id: intOrNull(b.constituency_id), election_id: intOrNull(b.election_id), errors };
}

// Checks the party / constituency / election combination against the master data. Returns { errors, party, cons, election }.
async function checkScope(c, excludeId = null) {
    const errors = {};
    let party = null, cons = null, el = null;
    if (!isId(c.constituency_id)) errors.constituency_id = { code: 'CONSTITUENCY_REQUIRED', message: 'Select a constituency.' };
    else {
        [[cons]] = await db.query('SELECT constituency_id, name, kind, state_id, is_active FROM constituencies WHERE constituency_id = ?', [c.constituency_id]).then(([x]) => [x]);
        if (!cons) errors.constituency_id = { code: 'CONSTITUENCY_UNKNOWN', message: 'Unknown constituency.' };
        else if (!cons.is_active) errors.constituency_id = { code: 'CONSTITUENCY_INACTIVE', message: 'This constituency is not active.' };
    }
    if (!isId(c.party_id)) errors.party_id = { code: 'PARTY_REQUIRED', message: 'Select a party (or Independent).' };
    else {
        [[party]] = await db.query('SELECT party_id, name, abbreviation, all_states, status FROM parties WHERE party_id = ?', [c.party_id]).then(([x]) => [x]);
        if (!party) errors.party_id = { code: 'PARTY_UNKNOWN', message: 'Unknown party.' };
        else if (party.status !== 'ACTIVE') errors.party_id = { code: 'PARTY_INACTIVE', message: 'This party is inactive.' };
        else if (cons && !party.all_states) {
            const [ok] = await db.query('SELECT 1 FROM party_states WHERE party_id = ? AND state_id = ?', [party.party_id, cons.state_id]);
            if (!ok.length) errors.party_id = { code: 'PARTY_NOT_IN_STATE', message: `${party.abbreviation} is not set up to contest in this state. Add the state to the party first.` };
        }
    }
    el = isId(c.election_id) ? (await db.query('SELECT * FROM elections WHERE election_id = ?', [c.election_id]))[0][0] : await election.current();
    if (!el) errors.election_id = { code: 'ELECTION_UNKNOWN', message: 'No election is configured.' };
    else if (cons && el.election_type !== 'OTHER' && el.election_type !== cons.kind)
        errors.constituency_id = errors.constituency_id || { code: 'KIND_MISMATCH', message: `This election is ${el.election_type.toLowerCase()}; pick a ${el.election_type.toLowerCase()} constituency.` };
    // One candidate per party per constituency in an election; Independents may be several.
    if (!Object.keys(errors).length && party.abbreviation !== 'IND') {
        const [dup] = await db.query('SELECT candidate_id FROM candidates WHERE election_id=? AND constituency_id=? AND party_id=? AND candidate_id <> ?',
            [el.election_id, cons.constituency_id, party.party_id, excludeId || 0]);
        if (dup.length) errors.party_id = { code: 'PARTY_ALREADY_FIELDED', message: `${party.abbreviation} already has a candidate in this constituency for this election.` };
    }
    return { errors, party, cons, election: el };
}

router.post('/candidates', requireAdmin, async (req, res) => {
    try {
        const c = cleanCandidate(req.body || {});
        if (Object.keys(c.errors).length) return bad(res, c.errors);
        const l = await lockedState(); if (l) return res.status(409).json(lockedMsg(l));
        const sc = await checkScope(c);
        if (Object.keys(sc.errors).length) return bad(res, sc.errors);
        const active = req.body?.status === undefined ? true : String(req.body.status).toUpperCase() === 'ACTIVE';
        try {
            const [r] = await db.query(`INSERT INTO candidates (name, party, party_id, symbol, description, position, election_id, constituency_id, is_active, status)
                VALUES (?,?,?,?,?,?,?,?,?,?)`, [c.name, sc.party.name, sc.party.party_id, c.symbol, c.description, c.position, sc.election.election_id, sc.cons.constituency_id, active, active ? 'Active' : 'Inactive']);
            await audit(null, `CANDIDATE_ADDED:${r.insertId}`, 'admin');
            res.status(201).json({ success: true, candidate_id: r.insertId });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return bad(res, { name: { code: 'DUPLICATE', message: 'A candidate with this name already exists in this constituency for this election.' } }, 409);
            throw e;
        }
    } catch (e) { oops(res, 'add candidate', e, 'Could not add candidate'); }
});

router.put('/candidates/:id', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const c = cleanCandidate(req.body || {});
        if (Object.keys(c.errors).length) return bad(res, c.errors);
        const l = await lockedState(); if (l) return res.status(409).json(lockedMsg(l));
        const [[cur]] = await db.query('SELECT * FROM candidates WHERE candidate_id = ?', [id]).then(([x]) => [x]);
        if (!cur) return res.status(404).json({ success: false, message: 'Candidate not found' });
        // Votes already cast refer to this candidate: identity fields may not change, descriptive ones may.
        if (Number(cur.vote_count) > 0) {
            const changed = [];
            if (c.name !== cur.name) changed.push('name');
            if (c.party_id !== cur.party_id) changed.push('party');
            if (c.constituency_id !== cur.constituency_id) changed.push('constituency');
            if (c.election_id !== null && c.election_id !== cur.election_id) changed.push('election');
            if (changed.length) return res.status(409).json({ success: false, code: 'IDENTITY_LOCKED',
                message: `This candidate already has recorded votes, so ${changed.join(', ')} cannot be changed. Description, symbol and position can still be edited.` });
            await db.query('UPDATE candidates SET symbol=?, description=?, position=? WHERE candidate_id=?', [c.symbol, c.description, c.position, id]);
        } else {
            c.election_id = c.election_id ?? cur.election_id;
            const sc = await checkScope(c, id);
            if (Object.keys(sc.errors).length) return bad(res, sc.errors);
            try {
                await db.query(`UPDATE candidates SET name=?, party=?, party_id=?, symbol=?, description=?, position=?, election_id=?, constituency_id=? WHERE candidate_id=?`,
                    [c.name, sc.party.name, sc.party.party_id, c.symbol, c.description, c.position, sc.election.election_id, sc.cons.constituency_id, id]);
            } catch (e) {
                if (e.code === 'ER_DUP_ENTRY') return bad(res, { name: { code: 'DUPLICATE', message: 'A candidate with this name already exists in this constituency for this election.' } }, 409);
                throw e;
            }
        }
        await audit(null, `CANDIDATE_EDITED:${id}`, 'admin');
        res.json({ success: true });
    } catch (e) { oops(res, 'edit candidate', e, 'Could not update candidate'); }
});

// Activate / deactivate. Allowed while voting is open (a withdrawn candidate must disappear for NEW voters at once)
// but not after the election ended. Historical votes are never touched.
router.post('/candidates/:id/active', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id), active = req.body?.active === true;
        const e = await election.current();
        if (e && e.effective_status === 'ENDED') return res.status(409).json({ success: false, code: 'ELECTION_LOCKED', message: 'The election has ended; candidate status can no longer change.' });
        if (active) {
            const [[c]] = await db.query(`SELECT c.party_id, c.constituency_id, c.election_id, p.status AS party_status FROM candidates c LEFT JOIN parties p ON p.party_id = c.party_id WHERE c.candidate_id = ?`, [id]).then(([x]) => [x]);
            if (!c) return res.status(404).json({ success: false, message: 'Candidate not found' });
            if (!c.party_id || !c.constituency_id) return res.status(409).json({ success: false, code: 'UNASSIGNED', message: 'Assign a party and constituency (edit the candidate) before activating.' });
            if (c.party_status !== 'ACTIVE') return res.status(409).json({ success: false, code: 'PARTY_INACTIVE', message: 'The candidate\'s party is inactive.' });
        }
        const [r] = await db.query("UPDATE candidates SET is_active=?, status=? WHERE candidate_id=?", [active, active ? 'Active' : 'Inactive', id]);
        if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Candidate not found' });
        await audit(null, `CANDIDATE_${active ? 'ACTIVATED' : 'DEACTIVATED'}:${id}`, 'admin');
        res.json({ success: true });
    } catch (e) { oops(res, 'candidate active', e, 'Could not update candidate'); }
});

module.exports = router;
