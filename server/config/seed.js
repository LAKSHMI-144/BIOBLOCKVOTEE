// Illustrative master data. Idempotent: rows are inserted only when missing (INSERT IGNORE on the unique keys),
// so an administrator's later edits, renames or deactivations are never overwritten.
//
// IMPORTANT – what this is NOT: it is not an official or exhaustive list. It contains NO candidates and NO voters.
//  * States / Union Territories: India has 28 states and 8 UTs (ISO 3166-2:IN codes).
//  * Parties: BJP and INC contest in every state; the other parties are linked only to states where they are well
//    known. Recognition status (national/state) is deliberately NOT stored – it changes after elections.
//  * Constituencies: only Karnataka's 28 parliamentary constituencies are seeded (the project's home state);
//    administrators add constituencies for other states in the admin panel.
const db = require('./db');

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

// [name, abbreviation, all_states, [state codes], notes]
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
    ['Aam Aadmi Party', 'AAP', false, ['DL', 'PB'], null],
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

const KARNATAKA_PARLIAMENTARY = ['Chikkodi', 'Belgaum', 'Bagalkot', 'Bijapur', 'Gulbarga', 'Raichur', 'Bidar', 'Koppal', 'Bellary',
    'Haveri', 'Dharwad', 'Uttara Kannada', 'Davanagere', 'Shimoga', 'Udupi Chikmagalur', 'Hassan', 'Dakshina Kannada', 'Chitradurga',
    'Tumkur', 'Mandya', 'Mysore', 'Chamarajanagar', 'Bangalore Rural', 'Bangalore North', 'Bangalore Central', 'Bangalore South',
    'Chikkaballapur', 'Kolar'];

async function seed() {
    const done = [];
    let added = 0;
    for (const [code, name] of STATES) added += (await db.query('INSERT IGNORE INTO states (code, name, kind) VALUES (?,?,?)', [code, name, 'STATE']))[0].affectedRows;
    for (const [code, name] of UNION_TERRITORIES) added += (await db.query('INSERT IGNORE INTO states (code, name, kind) VALUES (?,?,?)', [code, name, 'UT']))[0].affectedRows;
    if (added) done.push(`+ ${added} states / union territories`);

    const [[{ n: nParties }]] = await db.query('SELECT COUNT(*) n FROM parties');
    const [st] = await db.query('SELECT state_id, code FROM states');
    const byCode = Object.fromEntries(st.map(s => [s.code, s.state_id]));
    if (nParties === 0) {
        for (const [name, abbr, all, codes, notes] of PARTIES) {
            const [r] = await db.query('INSERT IGNORE INTO parties (name, abbreviation, all_states, notes) VALUES (?,?,?,?)', [name, abbr, all, notes]);
            if (!r.insertId) continue;
            for (const c of codes) if (byCode[c]) await db.query('INSERT IGNORE INTO party_states (party_id, state_id) VALUES (?,?)', [r.insertId, byCode[c]]);
        }
        done.push(`+ ${PARTIES.length} parties (illustrative)`);
    }

    const [[{ n: nCons }]] = await db.query('SELECT COUNT(*) n FROM constituencies');
    if (nCons === 0) {
        for (const name of KARNATAKA_PARLIAMENTARY)
            await db.query("INSERT IGNORE INTO constituencies (state_id, name, kind) VALUES (?,?, 'PARLIAMENTARY')", [byCode.KA, name]);
        done.push(`+ ${KARNATAKA_PARLIAMENTARY.length} Karnataka parliamentary constituencies`);
    }
    return done;
}
module.exports = seed;
module.exports.DATA = { STATES, UNION_TERRITORIES, PARTIES, KARNATAKA_PARLIAMENTARY };
