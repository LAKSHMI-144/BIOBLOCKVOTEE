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
    // India -> State/UT -> Constituency. Master data; seeded by config/seed.js, extendable by the admin.
    states: `CREATE TABLE IF NOT EXISTS states (
        state_id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(4) NOT NULL, name VARCHAR(80) NOT NULL,
        kind ENUM('STATE','UT') NOT NULL DEFAULT 'STATE',
        UNIQUE KEY uq_states_code (code), UNIQUE KEY uq_states_name (name))`,
    constituencies: `CREATE TABLE IF NOT EXISTS constituencies (
        constituency_id INT AUTO_INCREMENT PRIMARY KEY, state_id INT NOT NULL, name VARCHAR(100) NOT NULL,
        kind ENUM('PARLIAMENTARY','ASSEMBLY') NOT NULL DEFAULT 'PARLIAMENTARY',
        is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_constituency (state_id, name, kind), KEY idx_constituency_state (state_id),
        CONSTRAINT fk_constituency_state FOREIGN KEY (state_id) REFERENCES states(state_id))`,
    // Party master data is kept apart from candidates. all_states = contests everywhere (BJP, INC, Independent);
    // otherwise the states it contests in are listed in party_states.
    parties: `CREATE TABLE IF NOT EXISTS parties (
        party_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, abbreviation VARCHAR(20) NOT NULL,
        all_states BOOLEAN NOT NULL DEFAULT FALSE, status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        notes VARCHAR(250) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_party_name (name), UNIQUE KEY uq_party_abbr (abbreviation))`,
    party_states: `CREATE TABLE IF NOT EXISTS party_states (
        party_id INT NOT NULL, state_id INT NOT NULL, PRIMARY KEY (party_id, state_id),
        CONSTRAINT fk_ps_party FOREIGN KEY (party_id) REFERENCES parties(party_id) ON DELETE CASCADE,
        CONSTRAINT fk_ps_state FOREIGN KEY (state_id) REFERENCES states(state_id) ON DELETE CASCADE)`,
    // Never stores a government ID number. Only a salted hash + masked tail of the phone used for the OTP.
    identity_verifications: `CREATE TABLE IF NOT EXISTS identity_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY, voter_id VARCHAR(20) NOT NULL, provider VARCHAR(30) NOT NULL,
        status ENUM('PENDING','VERIFIED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
        contact_hash CHAR(64) NULL, contact_masked VARCHAR(20) NULL,
        otp_expires_at DATETIME NULL, attempts INT NOT NULL DEFAULT 0,
        sends INT NOT NULL DEFAULT 0, last_sent_at DATETIME NULL, verified_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_idv_voter (voter_id))`,
    liveness_challenges: `CREATE TABLE IF NOT EXISTS liveness_challenges (
        token_hash CHAR(64) PRIMARY KEY, voter_id VARCHAR(20) NOT NULL,
        actions JSON NOT NULL, expires_at DATETIME NOT NULL, consumed_at DATETIME NULL,
        verification_token_hash CHAR(64) NULL, identity_frame_hash CHAR(64) NULL,
        liveness_passed_at DATETIME NULL, identity_consumed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_liveness_expiry (expires_at),
        CONSTRAINT fk_liveness_voter FOREIGN KEY (voter_id) REFERENCES voters(voter_id) ON DELETE CASCADE)`
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
        ['audit_log', 'actor', "VARCHAR(30) NOT NULL DEFAULT 'voter'"],
        ['audit_log', 'event_type', 'VARCHAR(60) NULL'],
        ['audit_log', 'status', "ENUM('SUCCESS','FAILED','DENIED') NOT NULL DEFAULT 'SUCCESS'"],
        ['audit_log', 'details', 'VARCHAR(250) NULL'],
        ['elections', 'election_type', "ENUM('PARLIAMENTARY','ASSEMBLY','OTHER') NOT NULL DEFAULT 'PARLIAMENTARY'"],
        ['voters', 'state_id', 'INT NULL'],
        ['voters', 'constituency_id', 'INT NULL'],
        ['candidates', 'position', 'VARCHAR(100) NULL'],
        ['candidates', 'status', "VARCHAR(20) NOT NULL DEFAULT 'Active'"],
        ['candidates', 'party_id', 'INT NULL'],
        ['candidates', 'constituency_id', 'INT NULL'],
        ['liveness_challenges', 'verification_token_hash', 'CHAR(64) NULL'],
        ['liveness_challenges', 'identity_frame_hash', 'CHAR(64) NULL'],
        ['liveness_challenges', 'liveness_passed_at', 'DATETIME NULL'],
        ['liveness_challenges', 'identity_consumed_at', 'DATETIME NULL']
    ];
    for (const [t, c, def] of cols) if (!(await hasColumn(t, c))) { await db.query(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`); done.push(`+ ${t}.${c}`); }

    const idx = [
        ['candidates', 'idx_candidates_election', 'election_id'],
        ['audit_log', 'idx_audit_voter', 'voter_id'],
        ['elections', 'idx_elections_status', 'status'],
        ['audit_log', 'idx_audit_event', 'event_type'],
        ['audit_log', 'idx_audit_time', 'timestamp'],
        ['voters', 'idx_voters_constituency', 'constituency_id'],
        ['candidates', 'idx_candidates_constituency', 'constituency_id'],
        ['candidates', 'idx_candidates_party', 'party_id']
    ];
    for (const [t, i, c] of idx) if (!(await hasIndex(t, i))) { await db.query(`ALTER TABLE \`${t}\` ADD INDEX \`${i}\` (\`${c}\`)`); done.push(`+ index ${i}`); }

    if (!(await hasFk('candidates', 'fk_candidates_election'))) {
        await db.query("ALTER TABLE candidates ADD CONSTRAINT fk_candidates_election FOREIGN KEY (election_id) REFERENCES elections(election_id) ON DELETE SET NULL");
        done.push('+ fk candidates.election_id');
    }
    for (const [t, n, ddl] of [
        ['voters', 'fk_voters_state', 'FOREIGN KEY (state_id) REFERENCES states(state_id) ON DELETE SET NULL'],
        ['voters', 'fk_voters_constituency', 'FOREIGN KEY (constituency_id) REFERENCES constituencies(constituency_id) ON DELETE SET NULL'],
        ['candidates', 'fk_candidates_party', 'FOREIGN KEY (party_id) REFERENCES parties(party_id)'],
        ['candidates', 'fk_candidates_constituency', 'FOREIGN KEY (constituency_id) REFERENCES constituencies(constituency_id)']
    ]) if (!(await hasFk(t, n))) { await db.query(`ALTER TABLE \`${t}\` ADD CONSTRAINT \`${n}\` ${ddl}`); done.push(`+ fk ${n}`); }
    // A candidate name can appear only once per election and constituency (NULLs of legacy rows are ignored by MySQL/MariaDB).
    if (!(await hasIndex('candidates', 'uq_candidate_scope'))) {
        try { await db.query("ALTER TABLE candidates ADD UNIQUE KEY uq_candidate_scope (election_id, constituency_id, name)"); done.push('+ unique candidate per election/constituency'); }
        catch (e) { done.push(`! uq_candidate_scope skipped: ${e.code}`); }
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
    done.push(...await require('./seed')());
    // Classify audit rows written before event_type/status/details existed (same rules as config/audit.js).
    const [bf] = await db.query(`UPDATE audit_log SET
        event_type = IF(action LIKE 'VOTED\\_FOR:%', 'VOTED', SUBSTRING_INDEX(action, ':', 1)),
        details = IF(action LIKE 'VOTED\\_FOR:%' OR INSTR(action, ':') = 0, NULL, SUBSTRING(action, INSTR(action, ':') + 1)),
        status = IF(action REGEXP 'DUPLICATE|DENIED|NOT_ELIGIBLE|CLOSED|UNAUTHORI[SZ]ED|NO_CONSTITUENCY', 'DENIED',
                 IF(action REGEXP 'FAIL|REJECT|MISMATCH|WRONG|ATTEMPTS|INVALID|ERROR|UNRECOGNI[SZ]ED|NO_FACE', 'FAILED', 'SUCCESS'))
        WHERE event_type IS NULL`);
    if (bf.affectedRows) done.push(`+ classified ${bf.affectedRows} existing audit row(s)`);
    // Keep the legacy `status` text column in step with is_active (is_active is what the voting code reads).
    await db.query("UPDATE candidates SET status = IF(is_active, 'Active', 'Inactive') WHERE status <> IF(is_active, 'Active', 'Inactive')");
    return done;
}
module.exports = ensureSchema;
