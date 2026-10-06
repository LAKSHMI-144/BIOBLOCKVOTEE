// Idempotent schema bootstrap/upgrade. Runs at server start and via `npm run migrate`.
// It only CREATEs missing tables and ADDs missing columns/indexes – it never drops or rewrites data.
const db = require('./db');

const has = async (sql, params) => (await db.query(sql, params))[0].length > 0;
const hasColumn = (t, c) => has("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?", [t, c]);
const hasIndex = (t, i) => has("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?", [t, i]);
const hasFk = (t, n) => has("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE='FOREIGN KEY'", [t, n]);

const TABLES = {
    voters: `CREATE TABLE IF NOT EXISTS voters (
        voter_id VARCHAR(20) PRIMARY KEY, name VARCHAR(100) NOT NULL, age INT NOT NULL, gender VARCHAR(10), address TEXT,
        has_voted BOOLEAN DEFAULT FALSE, is_eligible BOOLEAN NOT NULL DEFAULT TRUE, face_encoding LONGTEXT,
        face_registered_at TIMESTAMP NULL, registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    candidates: `CREATE TABLE IF NOT EXISTS candidates (
        candidate_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, party VARCHAR(100) NOT NULL,
        symbol VARCHAR(10), vote_count INT DEFAULT 0)`,
    audit_log: `CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY, voter_id VARCHAR(20), action VARCHAR(200), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    elections: `CREATE TABLE IF NOT EXISTS elections (
        election_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL,
        start_time DATETIME NULL, end_time DATETIME NULL,
        status ENUM('DRAFT','SCHEDULED','ACTIVE','ENDED') NOT NULL DEFAULT 'DRAFT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
    // Never stores a government ID number. Only a salted hash + masked tail of the phone used for the OTP.
    identity_verifications: `CREATE TABLE IF NOT EXISTS identity_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY, voter_id VARCHAR(20) NOT NULL, provider VARCHAR(30) NOT NULL,
        status ENUM('PENDING','VERIFIED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
        contact_hash CHAR(64) NULL, contact_masked VARCHAR(20) NULL,
        otp_expires_at DATETIME NULL, attempts INT NOT NULL DEFAULT 0,
        sends INT NOT NULL DEFAULT 0, last_sent_at DATETIME NULL, verified_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_idv_voter (voter_id))`
};

async function ensureSchema() {
    const done = [];
    for (const [name, ddl] of Object.entries(TABLES)) await db.query(ddl);

    const cols = [
        ['voters', 'is_eligible', 'BOOLEAN NOT NULL DEFAULT TRUE'],
        ['voters', 'face_registered_at', 'TIMESTAMP NULL'],
        ['candidates', 'description', 'VARCHAR(500) NULL'],
        ['candidates', 'is_active', 'BOOLEAN NOT NULL DEFAULT TRUE'],
        ['candidates', 'election_id', 'INT NULL'],
        ['audit_log', 'actor', "VARCHAR(30) NOT NULL DEFAULT 'voter'"]
    ];
    for (const [t, c, def] of cols) if (!(await hasColumn(t, c))) { await db.query(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`); done.push(`+ ${t}.${c}`); }

    const idx = [
        ['candidates', 'idx_candidates_election', 'election_id'],
        ['audit_log', 'idx_audit_voter', 'voter_id'],
        ['elections', 'idx_elections_status', 'status']
    ];
    for (const [t, i, c] of idx) if (!(await hasIndex(t, i))) { await db.query(`ALTER TABLE \`${t}\` ADD INDEX \`${i}\` (\`${c}\`)`); done.push(`+ index ${i}`); }

    if (!(await hasFk('candidates', 'fk_candidates_election'))) {
        await db.query("ALTER TABLE candidates ADD CONSTRAINT fk_candidates_election FOREIGN KEY (election_id) REFERENCES elections(election_id) ON DELETE SET NULL");
        done.push('+ fk candidates.election_id');
    }
    if (!(await hasFk('identity_verifications', 'fk_idv_voter'))) {
        // Existing rows can't violate this: the table was just created empty.
        await db.query("ALTER TABLE identity_verifications ADD CONSTRAINT fk_idv_voter FOREIGN KEY (voter_id) REFERENCES voters(voter_id) ON DELETE CASCADE");
        done.push('+ fk identity_verifications.voter_id');
    }

    // One election row must exist so the rules have something to enforce. DRAFT = voting closed
    // until an admin schedules it. Existing candidates are attached to it.
    const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM elections");
    if (n === 0) { await db.query("INSERT INTO elections (name, status) VALUES ('General Election', 'DRAFT')"); done.push('+ default DRAFT election'); }
    const [[e]] = await db.query("SELECT election_id FROM elections ORDER BY election_id LIMIT 1");
    const [r] = await db.query("UPDATE candidates SET election_id = ? WHERE election_id IS NULL", [e.election_id]);
    if (r.affectedRows) done.push(`+ attached ${r.affectedRows} candidate(s) to election ${e.election_id}`);
    return done;
}
module.exports = ensureSchema;
