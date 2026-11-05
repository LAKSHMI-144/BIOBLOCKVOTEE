// Reset the old academic demo records and populate a national Lok Sabha simulation.
// DESTRUCTIVE TO VOTER/CANDIDATE DATA: removes all existing voters and candidate rows.
// It preserves state/party masters, the admin account, and admin audit history.
// Candidate records are synthetic placeholders, NOT official nominees or a real ballot.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');
const ensureSchema = require('../config/schema');
const seed = require('../config/seed');

const PARTY_SYMBOLS = {
    BJP: 'LOTUS', INC: 'HAND', AAP: 'BROOM', BSP: 'ELEPHANT',
    TDP: 'CYCLE', YSRCP: 'FAN', 'JD(S)': 'CYCLE', 'JD(U)': 'ARROW',
    'CPI(M)': 'HAMMER', IUML: 'LADDER', BRS: 'CAR', AIMIM: 'KITE',
    DMK: 'SUN', AIADMK: 'TWO_LEAVES', SHS: 'BOW', NCP: 'CLOCK',
    SP: 'CYCLE', RJD: 'LANTERN', BJD: 'CONCH', SAD: 'SCALES',
    JMM: 'BOW_ARROW', AGP: 'ELEPHANT', AIUDF: 'LOCK', INLD: 'SPECTACLES',
    JJP: 'KEY', NPP: 'BOOK', NPF: 'COCK', MNF: 'STAR', ZPM: 'STAR',
    SKM: 'TABLE', SDF: 'UMBRELLA', TIPRA: 'PINEAPPLE', MGP: 'LION',
    JKNC: 'PLOUGH', JKPDP: 'INKPOT', AINRC: 'JAR', AITC: 'FLOWERS'
};
// Exactly four options per constituency, with regional parties where available.
// BJP + INC are national options; the other two vary by state/UT for this academic demo.
const DEMO_PARTIES_BY_STATE = {
    AN: ['BJP','INC','AAP','BSP'], AP: ['BJP','INC','TDP','YSRCP'],
    AR: ['BJP','INC','NPP','AAP'], AS: ['BJP','INC','AGP','AIUDF'],
    BR: ['BJP','INC','RJD','JD(U)'], CH: ['BJP','INC','AAP','BSP'],
    CG: ['BJP','INC','AAP','BSP'], DH: ['BJP','INC','AAP','BSP'],
    GA: ['BJP','INC','MGP','AAP'], GJ: ['BJP','INC','AAP','BSP'],
    HR: ['BJP','INC','INLD','JJP'], HP: ['BJP','INC','AAP','BSP'],
    JK: ['BJP','INC','JKNC','JKPDP'], JH: ['BJP','INC','JMM','AAP'],
    KA: ['BJP','INC','JD(S)','AAP'], KL: ['BJP','INC','CPI(M)','IUML'],
    LA: ['BJP','INC','AAP','BSP'], LD: ['BJP','INC','AAP','BSP'],
    MP: ['BJP','INC','AAP','BSP'], MH: ['BJP','INC','SHS','NCP'],
    MN: ['BJP','INC','NPP','AAP'], ML: ['BJP','INC','NPP','AAP'],
    MZ: ['BJP','INC','MNF','ZPM'], NL: ['BJP','INC','NPF','NPP'],
    DL: ['BJP','INC','AAP','BSP'], OD: ['BJP','INC','BJD','AAP'],
    PY: ['BJP','INC','DMK','AINRC'], PB: ['BJP','INC','AAP','SAD'],
    RJ: ['BJP','INC','AAP','BSP'], SK: ['BJP','INC','SKM','SDF'],
    TN: ['BJP','INC','DMK','AIADMK'], TS: ['BJP','INC','BRS','AIMIM'],
    TR: ['BJP','INC','CPI(M)','TIPRA'], UP: ['BJP','INC','SP','BSP'],
    UK: ['BJP','INC','AAP','BSP'], WB: ['BJP','INC','AITC','CPI(M)']
};
const DEFAULT_PARTIES = ['BJP','INC','AAP','BSP'];
const DESCRIPTION = 'SYNTHETIC DEMO DATA — fictional placeholder created for the BIOBLOCKVOTE academic simulation. Not a real candidate, nomination, or official ballot entry.';
const chunks = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

async function main() {
    await ensureSchema();
    await seed();

    const [seats] = await db.query("SELECT c.constituency_id, c.name AS constituency_name, s.name AS state_name, s.code AS state_code FROM constituencies c JOIN states s ON s.state_id = c.state_id WHERE c.kind = 'PARLIAMENTARY' AND c.is_active = TRUE ORDER BY s.name, c.name");
    if (seats.length !== 543) {
        throw new Error('Expected exactly 543 active Lok Sabha constituencies; found ' + seats.length + '. No voter/candidate reset was performed.');
    }

    const neededAbbrs = [...new Set(Object.values(DEMO_PARTIES_BY_STATE).flat())];
    const [partyRows] = await db.query('SELECT party_id, name, abbreviation FROM parties WHERE abbreviation IN (?)', [neededAbbrs]);
    const partyByAbbr = Object.fromEntries(partyRows.map(p => [p.abbreviation, p]));
    for (const abbr of neededAbbrs) {
        if (!partyByAbbr[abbr]) throw new Error('Required demo party is missing from the party master: ' + abbr);
    }

    const [electionRows] = await db.query('SELECT election_id FROM elections ORDER BY election_id DESC LIMIT 1');
    const latestElection = electionRows[0];
    if (!latestElection) throw new Error('No election exists after schema bootstrap.');

    // Activate all ballot choices and make their state/UT scopes visible in the admin party picker.
    await db.query("UPDATE parties SET status = 'ACTIVE' WHERE abbreviation IN (?)", [neededAbbrs]);
    for (const [stateCode, abbreviations] of Object.entries(DEMO_PARTIES_BY_STATE)) {
        const [stateRows] = await db.query('SELECT state_id FROM states WHERE code = ?', [stateCode]);
        const state = stateRows[0];
        if (!state) throw new Error('Missing state / UT for demo party scope: ' + stateCode);
        for (const abbreviation of abbreviations) {
            if (!['BJP','INC'].includes(abbreviation)) {
                await db.query('INSERT IGNORE INTO party_states (party_id, state_id) VALUES (?,?)', [partyByAbbr[abbreviation].party_id, state.state_id]);
            }
        }
    }

    const rows = [];
    for (const seat of seats) {
        const options = DEMO_PARTIES_BY_STATE[seat.state_code] || DEFAULT_PARTIES;
        if (options.length !== 4) throw new Error('Expected four party options for ' + seat.state_name);
        for (const abbreviation of options) {
            const party = partyByAbbr[abbreviation];
            rows.push([
                'Demo Candidate — ' + seat.constituency_name + ' — ' + abbreviation,
                party.name,
                PARTY_SYMBOLS[abbreviation] || 'DEMO',
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
    console.log('Synthetic party options per constituency: 4 (BJP + INC + two state/UT-specific options)');
    console.log('Synthetic candidate records: ' + candidateRows[0].n + ' (' + activeRows[0].n + ' active)');
    console.log('Voter records remaining: ' + voterRows[0].n);
    console.log('Election status: DRAFT (voting remains closed)');
    console.log('All candidate names are fictional demo placeholders, not official nominations.');
}

main()
    .catch(e => { console.error('Election demo reset failed:', e.message); process.exitCode = 1; })
    .finally(() => db.end());
