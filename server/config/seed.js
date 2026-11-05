// Illustrative master data. Idempotent: rows are inserted only when missing (INSERT IGNORE on the unique keys),
// so an administrator's later edits, renames or deactivations are never overwritten.
//
// IMPORTANT - this is not an official or exhaustive list. Demo candidates are fictional and are never voters.
//  * States / Union Territories: India has 28 states and 8 UTs (ISO 3166-2:IN codes).
//  * Parties: BJP and INC contest in every state; the other parties are linked only to states where they are well
//    known. Recognition status (national/state) is deliberately NOT stored – it changes after elections.
//  * Constituencies: Karnataka's parliamentary list plus clearly labelled demo assembly constituencies in ten states.
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

const KARNATAKA_PARLIAMENTARY = ['Chikkodi', 'Belgaum', 'Bagalkot', 'Bijapur', 'Gulbarga', 'Raichur', 'Bidar', 'Koppal', 'Bellary',
    'Haveri', 'Dharwad', 'Uttara Kannada', 'Davanagere', 'Shimoga', 'Udupi Chikmagalur', 'Hassan', 'Dakshina Kannada', 'Chitradurga',
    'Tumkur', 'Mandya', 'Mysore', 'Chamarajanagar', 'Bangalore Rural', 'Bangalore North', 'Bangalore Central', 'Bangalore South',
    'Chikkaballapur', 'Kolar'];

// Six fictional names per state, attached only to clearly labelled demonstration constituencies.
const DEMO_CANDIDATES = {
    KA: [['Anaya Bhatkal', 'BJP'], ['Veer Mallesh', 'INC'], ['Isha Soman', 'JD(S)'], ['Kabir Hegde', 'IND'], ['Tara Devadiga', 'IND'], ['Nikhil Rayan', 'IND']],
    TN: [['Iniya Velan', 'DMK'], ['Arul Kannan', 'AIADMK'], ['Mira Senthil', 'BJP'], ['Kavin Arasu', 'INC'], ['Yazhini Muthu', 'IND'], ['Rohan Ilango', 'IND']],
    KL: [['Nila Menon', 'CPI(M)'], ['Adith Nair', 'IUML'], ['Maya Kurup', 'INC'], ['Rithu Varma', 'BJP'], ['Devika Balan', 'IND'], ['Ahan Thomas', 'IND']],
    AP: [['Saanvi Kiran', 'TDP'], ['Vihan Reddy', 'YSRCP'], ['Charvi Naidu', 'BJP'], ['Reyan Prasad', 'INC'], ['Tara Vamsi', 'IND'], ['Nirav Chandra', 'IND']],
    TS: [['Aadhya Rao', 'BRS'], ['Ishaan Mirza', 'AIMIM'], ['Navya Goud', 'BJP'], ['Ritvik Anand', 'INC'], ['Saira Kiran', 'IND'], ['Keshav Varma', 'IND']],
    MH: [['Aarohi Deshmukh', 'SHS'], ['Neel Patil', 'NCP'], ['Ira Kulkarni', 'BJP'], ['Omkar Jadhav', 'INC'], ['Mihir Sawant', 'IND'], ['Rhea Bhosale', 'IND']],
    UP: [['Aarav Shekhar', 'SP'], ['Meera Sengar', 'BSP'], ['Rishit Awasthi', 'BJP'], ['Tanya Qureshi', 'INC'], ['Dev Malhotra', 'IND'], ['Ishita Suri', 'IND']],
    GJ: [['Kavya Trivedi', 'BJP'], ['Aarush Mehta', 'INC'], ['Niyati Desai', 'AAP'], ['Rohan Vyas', 'IND'], ['Mira Parmar', 'IND'], ['Vivan Shah', 'IND']],
    RJ: [['Aditi Rathore', 'BJP'], ['Lakshya Purohit', 'INC'], ['Navin Choudhary', 'BSP'], ['Ira Bhandari', 'AAP'], ['Reva Solanki', 'IND'], ['Aman Khatri', 'IND']],
    WB: [['Anik Banerjee', 'AITC'], ['Riya Chatterjee', 'CPI(M)'], ['Soham Dutta', 'BJP'], ['Mili Ghosh', 'INC'], ['Arjun Roy', 'IND'], ['Tithi Sen', 'IND']]
};

async function seed() {
    const done = [];
    let added = 0;
    for (const [code, name] of STATES) added += (await db.query('INSERT IGNORE INTO states (code, name, kind) VALUES (?,?,?)', [code, name, 'STATE']))[0].affectedRows;
    for (const [code, name] of UNION_TERRITORIES) added += (await db.query('INSERT IGNORE INTO states (code, name, kind) VALUES (?,?,?)', [code, name, 'UT']))[0].affectedRows;
    if (added) done.push(`+ ${added} states / union territories`);

    const [st] = await db.query('SELECT state_id, code FROM states');
    const byCode = Object.fromEntries(st.map(s => [s.code, s.state_id]));
    let partyCount = 0;
    for (const [name, abbr, all, codes, notes] of PARTIES) {
        const [r] = await db.query('INSERT IGNORE INTO parties (name, abbreviation, all_states, notes) VALUES (?,?,?,?)', [name, abbr, all, notes]);
        if (r.affectedRows) {
            partyCount += r.affectedRows;
            for (const c of codes) if (byCode[c]) await db.query('INSERT IGNORE INTO party_states (party_id, state_id) VALUES (?,?)', [r.insertId, byCode[c]]);
        }
    }
    if (partyCount) done.push(`+ ${partyCount} illustrative parties`);

    const [[{ n: nCons }]] = await db.query('SELECT COUNT(*) n FROM constituencies');
    if (nCons === 0) {
        for (const name of KARNATAKA_PARLIAMENTARY)
            await db.query("INSERT IGNORE INTO constituencies (state_id, name, kind) VALUES (?,?, 'PARLIAMENTARY')", [byCode.KA, name]);
        done.push(`+ ${KARNATAKA_PARLIAMENTARY.length} Karnataka parliamentary constituencies`);
    }

    const [partyRows] = await db.query('SELECT party_id, name, abbreviation, all_states FROM parties');
    const seededParties = new Map(partyRows.map(p => [`${p.name}\u0000${p.abbreviation}`, p]));
    const partyByAbbr = Object.fromEntries(PARTIES.map(([name, abbreviation]) => {
        const party = seededParties.get(`${name}\u0000${abbreviation}`);
        return party ? [abbreviation, party] : null;
    }).filter(Boolean));
    const partyCanContest = async (party, state_id) => {
        if (party.all_states) return true;
        const [scope] = await db.query('SELECT 1 FROM party_states WHERE party_id = ? AND state_id = ?', [party.party_id, state_id]);
        return scope.length > 0;
    };
    let demoCons = 0, demoCandidates = 0;
    for (const [code, candidates] of Object.entries(DEMO_CANDIDATES)) {
        const state_id = byCode[code];
        if (!state_id) continue;
        for (let i = 0; i < candidates.length; i++) {
            const name = `Demonstration Assembly Constituency ${String(i + 1).padStart(2, '0')}`;
            const [inserted] = await db.query("INSERT IGNORE INTO constituencies (state_id, name, kind) VALUES (?, ?, 'ASSEMBLY')", [state_id, name]);
            demoCons += inserted.affectedRows;
            const [[constituency]] = await db.query("SELECT constituency_id FROM constituencies WHERE state_id = ? AND name = ? AND kind = 'ASSEMBLY'", [state_id, name]).then(([rows]) => [rows]);
            if (!constituency) continue;
            const [illustrativeName, requestedAbbreviation] = candidates[i];
            const candidateName = `Demo Candidate - ${illustrativeName}`;
            let abbreviation = requestedAbbreviation;
            let party = partyByAbbr[abbreviation];
            if (!party && abbreviation !== 'IND') { abbreviation = 'IND'; party = partyByAbbr.IND; }
            if (!party) continue;
            if (!(await partyCanContest(party, state_id))) {
                if (abbreviation === 'IND') continue;
                abbreviation = 'IND';
                party = partyByAbbr.IND;
                if (!party || !(await partyCanContest(party, state_id))) continue;
            }
            const [existing] = await db.query('SELECT candidate_id FROM candidates WHERE name = ? AND constituency_id = ? LIMIT 1', [candidateName, constituency.constituency_id]);
            if (existing.length) continue;
            const description = 'DEMO DATA - Fictional candidate for UI demonstration only; not an actual election candidate.';
            const [created] = await db.query(`INSERT INTO candidates (name, party, party_id, description, position, election_id, constituency_id, is_active, status)
                VALUES (?, ?, ?, ?, ?, NULL, ?, FALSE, 'Inactive')`, [candidateName, abbreviation, party.party_id, description, 'Demonstration candidate', constituency.constituency_id]);
            demoCandidates += created.affectedRows;
        }
    }
    if (demoCons) done.push(`+ ${demoCons} demonstration constituencies`);
    if (demoCandidates) done.push(`+ ${demoCandidates} fictional demonstration candidates`);
    return done;
}
module.exports = seed;
module.exports.DATA = { STATES, UNION_TERRITORIES, PARTIES, KARNATAKA_PARLIAMENTARY, DEMO_CANDIDATES };
