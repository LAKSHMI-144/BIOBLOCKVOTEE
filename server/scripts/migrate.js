// Idempotent upgrade for databases created from an older schema.sql.
//   cd server && npm run migrate
require('dotenv').config();
const db = require('../config/db');

const COLUMNS = [
    ['voters', 'is_eligible', 'BOOLEAN NOT NULL DEFAULT TRUE'],
    ['voters', 'face_registered_at', 'TIMESTAMP NULL']
];

(async () => {
    try {
        for (const [table, col, def] of COLUMNS) {
            const [rows] = await db.query(
                `SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, col]);
            if (rows.length) { console.log(`= ${table}.${col} already exists`); continue; }
            await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
            console.log(`+ added ${table}.${col}`);
        }
        console.log('Migration complete');
    } catch (e) {
        console.error('Migration failed:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
