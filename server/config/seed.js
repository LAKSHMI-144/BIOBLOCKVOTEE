// India-wide master data. Idempotent: state, party and constituency rows are inserted only when missing.
// The 543 Parliamentary Constituency names are based on ECI Atlas 2024, pages 17–19.
// Candidates are seeded separately by the explicit reset-election-demo script and are always labelled demo.
const db = require('./db');
const LOK_SABHA_CONSTITUENCIES = require('./lokSabhaConstituencies');

const STATES = [
    ['AP', 'Andhra Pradesh'], ['AR', 'Arunachal Pradesh'], ['AS', 'Assam'], ['BR', 'Bihar'], ['CG', 'Chhattisgarh'],
    ['GA', 'Goa'], ['GJ', 'Gujarat'], ['HR', 'Haryana'], ['HP', 'Himachal Pradesh'], ['JH', 'Jharkhand'],
    ['KA', 'Karnataka'], ['KL', 'Kerala'], ['MP', 'Madhya Pradesh'], ['MH', 'Maharashtra'], ['MN', 'Manipur'],
    ['ML', 'Meghalaya'], ['MZ', 'Mizoram'], ['NL', 'Nagaland'], ['OD', 'Odisha'], ['PB', 'Punjab'],
    ['RJ', 'Rajasthan'], ['SK', 'Sikkim'], ['TN', 'Tamil Nadu'], ['TS', 'Telangana'], ['TR', 'Tripura'],
    ['UP', 'Uttar Pradesh'], ['UK', 'Uttarakhand'], ['WB', 'West Bengal']
];
const UNION_TERRITORIES = [
    ['AN', 'Andaman and Nicobar Islands'], ['CH', 'Chandigarh'], ['DH', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['DL', 'Delhi'], ['JK', 'Jammu and Kashmir'], ['LA', 'Ladakh'], ['LD', 'Lakshadweep'], ['PY', 'Puducherry']
];

// [name, abbreviation, all_states, [state codes], notes]. AAP and BSP are also enabled as demo ballot options nationwide.
const PARTIES = [
    ['Bharatiya Janata Party', 'BJP', true, [], null],
    ['Indian National Congress', 'INC', true, [], null],
    ['Independent', 'IND', true, [], 'Not a party: a candidate standing without party affiliation.'],
    ['Telugu Desam Party', 'TDP', false, ['AP'], null],
    ['Yuvajana Sramika Rythu Congress Party', 'YSRCP', false, ['AP'], null],
    ['Bharat Rashtra Samithi', 'BRS', false, ['TS'], null],
    ['All India Majlis-e-Ittehadul Muslimeen', 'AIMIM', false, ['TS'], null],
    ['Janata Dal (Secular)', 'JD(S)', false, ['KA'], null],
    ['Dravida Munnetra Kazhagam', 'DMK', false, ['TN', 'PY'], null],
    ['All India Anna Dravida Munnetra Kazhagam', 'AIADMK', false, ['TN'], null],
    ['Communist Party of India (Marxist)', 'CPI(M)', false, ['KL', 'WB', 'TR'], null],
    ['Indian Union Muslim League', 'IUML', false, ['KL'], null],
    ['All India Trinamool Congress', 'AITC', false, ['WB'], null],
    ['Shiv Sena', 'SHS', false, ['MH'], 'The party has split into factions; add the faction name used on the ballot if needed.'],
    ['Nationalist Congress Party', 'NCP', false, ['MH'], 'The party has split into factions; add the faction name used on the ballot if needed.'],
    ['Samajwadi Party', 'SP', false, ['UP'], null],
    ['Bahujan Samaj Party', 'BSP', false, ['UP'], null],
    ['Rashtriya Janata Dal', 'RJD', false, ['BR'], null],
    ['Janata Dal (United)', 'JD(U)', false, ['BR'], null],
    ['Biju Janata Dal', 'BJD', false, ['OD'], null],
    ['Shiromani Akali Dal', 'SAD', false, ['PB'], null],
    ['Aam Aadmi Party', 'AAP', false, ['DL', 'PB', 'GJ', 'RJ'], null],
    ['Jharkhand Mukti Morcha', 'JMM', false, ['JH'], null],
    ['Asom Gana Parishad', 'AGP', false, ['AS'], null],
    ['All India United Democratic Front', 'AIUDF', false, ['AS'], null],
    ['Indian National Lok Dal', 'INLD', false, ['HR'], null],
    ['Jannayak Janta Party', 'JJP', false, ['HR'], null],
    ["National People's Party", 'NPP', false, ['ML', 'MN', 'AR'], null],
    ["Naga People's Front", 'NPF', false, ['NL'], null],
    ['Mizo National Front', 'MNF', false, ['MZ'], null],
    ['Zoram People\'s Movement', 'ZPM', false, ['MZ'], null],
    ['Sikkim Krantikari Morcha', 'SKM', false, ['SK'], null],
    ['Sikkim Democratic Front', 'SDF', false, ['SK'], null],
    ['Tipra Motha Party', 'TIPRA', false, ['TR'], null],
    ['Maharashtrawadi Gomantak Party', 'MGP', false, ['GA'], null],
    ['Jammu & Kashmir National Conference', 'JKNC', false, ['JK'], null],
    ['Jammu and Kashmir Peoples Democratic Party', 'JKPDP', false, ['JK'], null],
    ['All India N.R. Congress', 'AINRC', false, ['PY'], null]
];

async function seed() {
    const done = [];
    let added = 0;
    for (const [code, name] of STATES)
        added += (await db.query('INSERT IGNORE INTO states (code, name, kind) VALUES (?,?,?)', [code, name, 'STATE']))[0].affectedRows;
    for (const [code, name] of UNION_TERRITORIES)
        added += (await db.query('INSERT IGNORE INTO states (code, name, kind) VALUES (?,?,?)', [code, name, 'UT']))[0].affectedRows;
    if (added) done.push('+' + added + ' states / union territories');

    const [stateRows] = await db.query('SELECT state_id, code FROM states');
    const byCode = Object.fromEntries(stateRows.map(s => [s.code, s.state_id]));

    let partyCount = 0;
    for (const [name, abbr, all, codes, notes] of PARTIES) {
        const [r] = await db.query(
            'INSERT IGNORE INTO parties (name, abbreviation, all_states, notes) VALUES (?,?,?,?)',
            [name, abbr, all, notes]
        );
        if (r.affectedRows) {
            partyCount += r.affectedRows;
            for (const code of codes) {
                if (byCode[code]) await db.query(
                    'INSERT IGNORE INTO party_states (party_id, state_id) VALUES (?,?)',
                    [r.insertId, byCode[code]]
                );
            }
        }
    }
    if (partyCount) done.push('+' + partyCount + ' illustrative party master records');

    // The academic demo ballot intentionally offers four selectable party slates in every PC.
    // This is not a statement that these parties officially nominate candidates in every constituency.
    const [demoParties] = await db.query(
        "SELECT party_id, abbreviation FROM parties WHERE abbreviation IN ('AAP','BSP')"
    );
    for (const party of demoParties) {
        for (const stateId of Object.values(byCode)) {
            await db.query(
                'INSERT IGNORE INTO party_states (party_id, state_id) VALUES (?,?)',
                [party.party_id, stateId]
            );
        }
    }
    await db.query(
        "UPDATE parties SET status = 'ACTIVE' WHERE abbreviation IN ('BJP','INC','AAP','BSP')"
    );

    let constituencyCount = 0;
    for (const [code, names] of Object.entries(LOK_SABHA_CONSTITUENCIES)) {
        const stateId = byCode[code];
        if (!stateId) throw new Error('Missing state / UT master row for code ' + code);
        for (const name of names) {
            const [r] = await db.query(
                "INSERT IGNORE INTO constituencies (state_id, name, kind, is_active) VALUES (?, ?, 'PARLIAMENTARY', TRUE)",
                [stateId, name]
            );
            constituencyCount += r.affectedRows;
        }
    }
    await db.query("UPDATE constituencies SET is_active = TRUE WHERE kind = 'PARLIAMENTARY'");
    if (constituencyCount) done.push('+' + constituencyCount + ' Lok Sabha parliamentary constituencies');
    return done;
}
module.exports = seed;
module.exports.DATA = { STATES, UNION_TERRITORIES, PARTIES, LOK_SABHA_CONSTITUENCIES };
