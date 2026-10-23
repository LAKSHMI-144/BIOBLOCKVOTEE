// One definition of "votes" shared by the dashboard and the results page, so the two can never disagree.
const db = require('./db');

async function tally() {
    const [rows] = await db.query(`SELECT c.candidate_id, c.name, c.is_active, c.vote_count AS votes, c.position,
            c.party_id, p.name AS party_name, p.abbreviation AS party_abbr, c.constituency_id, k.name AS constituency_name, s.name AS state_name
        FROM candidates c LEFT JOIN parties p ON p.party_id = c.party_id
        LEFT JOIN constituencies k ON k.constituency_id = c.constituency_id LEFT JOIN states s ON s.state_id = k.state_id
        ORDER BY c.vote_count DESC, c.candidate_id`);
    const candidates = rows.map(r => ({ ...r, is_active: !!r.is_active, votes: Number(r.votes) }));
    const total_votes = candidates.reduce((n, c) => n + c.votes, 0);
    const pct = v => (total_votes ? Math.round((v / total_votes) * 1000) / 10 : 0);
    candidates.forEach(c => { c.percent = pct(c.votes); });
    const parties = new Map();
    for (const c of candidates) {
        const key = c.party_abbr || 'Unassigned';
        parties.set(key, (parties.get(key) || 0) + c.votes);
    }
    const by_party = [...parties].map(([party, votes]) => ({ party, votes, percent: pct(votes) })).sort((a, b) => b.votes - a.votes);
    return { candidates, total_votes, by_party };
}
module.exports = { tally };
