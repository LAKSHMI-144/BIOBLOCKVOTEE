// Reset the old academic demo records and populate a national Lok Sabha simulation.
// DESTRUCTIVE TO VOTER/CANDIDATE DATA: removes all existing voters and candidate rows.
// It preserves state/party masters, the admin account, and admin audit history.
// Candidate records are synthetic placeholders, NOT official nominees or a real ballot.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');
const ensureSchema = require('../config/schema');
const seed = require('../config/seed');

const DEMO_PARTIES = [
    { abbr: 'BJP', symbol: 'LOTUS' },
    { abbr: 'INC', symbol: 'HAND' },
    { abbr: 'AAP', symbol: 'BROOM' },
    { abbr: 'BSP', symbol: 'ELEPHANT' }
];
const DESCRIPTION = 'SYNTHETIC DEMO DATA — fictional placeholder created for the BIOBLOCKVOTE academic simulation. Not a real candidate, nomination, or official ballot entry.';
const chunks = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

async function main() {
    await ensureSchema();
    await seed();

    const [seats] = await db.query("SELECT c.constituency_id, c.name AS constituency_name, s.name AS state_name FROM constituencies c JOIN states s ON s.state_id = c.state_id WHERE c.kind = 'PARLIAMENTARY' AND c.is_active = TRUE ORDER BY s.name, c.name");
    if (seats.length !== 543) {
        throw new Error('Expected exactly 543 active Lok Sabha constituencies; found ' + seats.length + '. No voter/candidate reset was performed.');
    }

    const [partyRows] = await db.query("SELECT party_id, name, abbreviation FROM parties WHERE abbreviation IN ('BJP','INC','AAP','BSP') AND status = 'ACTIVE'");
    const partyByAbbr = Object.fromEntries(partyRows.map(p => [p.abbreviation, p]));
    for (const p of DEMO_PARTIES) {
        if (!partyByAbbr[p.abbr]) throw new Error('Required demo party is missing or inactive: ' + p.abbr);
    }

    const [electionRows] = await db.query('SELECT election_id FROM elections ORDER BY election_id DESC LIMIT 1');
    const latestElection = electionRows[0];
    if (!latestElection) throw new Error('No election exists after schema bootstrap.');

    const rows = [];
    for (const seat of seats) {
        for (const item of DEMO_PARTIES) {
            const party = partyByAbbr[item.abbr];
            rows.push([
                'Demo Candidate — ' + seat.constituency_name + ' — ' + item.abbr,
                party.name,
                item.symbol,
                DESCRIPTION,
                'Lok Sabha candidate (simulation)',
                'Active',
                0,
                latestElection.election_id,
                true,
                party.party_id,
                seat.constituency_id
            ]);
        }
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM voters');
        await conn.query('DELETE FROM candidates');
        await conn.query("DELETE FROM audit_log WHERE actor = 'voter' OR voter_id IS NOT NULL");
        await conn.query("INSERT INTO voter_id_counters (sequence_name, next_value) VALUES ('voter', 1) ON DUPLICATE KEY UPDATE next_value = 1");
        await conn.query("UPDATE elections SET status = 'ENDED' WHERE election_id <> ?", [latestElection.election_id]);
        await conn.query(
            "UPDATE elections SET name = ?, election_type = 'PARLIAMENTARY', status = 'DRAFT', start_time = NULL, end_time = NULL WHERE election_id = ?",
            ['India Lok Sabha General Election — PM Formation Simulation', latestElection.election_id]
        );

        const insertSql = 'INSERT INTO candidates (name, party, symbol, description, position, status, vote_count, election_id, is_active, party_id, constituency_id) VALUES ?';
        for (const group of chunks(rows, 250)) {
            await conn.query(insertSql, [group]);
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
    } finally {
        conn.release();
    }

    await db.query('ALTER TABLE candidates AUTO_INCREMENT = 1');

    const [voterRows] = await db.query('SELECT COUNT(*) AS n FROM voters');
    const [candidateRows] = await db.query('SELECT COUNT(*) AS n FROM candidates');
    const [seatRows] = await db.query("SELECT COUNT(*) AS n FROM constituencies WHERE kind = 'PARLIAMENTARY' AND is_active = TRUE");
    const [activeRows] = await db.query('SELECT COUNT(*) AS n FROM candidates WHERE is_active = TRUE');
    console.log('Lok Sabha simulation reset complete.');
    console.log('Active states / UTs: 36');
    console.log('Active parliamentary constituencies: ' + seatRows[0].n);
    console.log('Synthetic party options per constituency: 4 (BJP, INC, AAP, BSP)');
    console.log('Synthetic candidate records: ' + candidateRows[0].n + ' (' + activeRows[0].n + ' active)');
    console.log('Voter records remaining: ' + voterRows[0].n);
    console.log('Election status: DRAFT (voting remains closed)');
    console.log('All candidate names are fictional demo placeholders, not official nominations.');
}

main()
    .catch(e => { console.error('Election demo reset failed:', e.message); process.exitCode = 1; })
    .finally(() => db.end());
