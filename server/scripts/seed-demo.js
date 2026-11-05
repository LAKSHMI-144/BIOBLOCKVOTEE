// Explicit, repeatable demo-data seed. It inserts missing rows only and never modifies existing records.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');
const ensureSchema = require('../config/schema');
const seed = require('../config/seed');

async function main() {
    await ensureSchema();
    const changes = await seed();
    console.log(changes.length ? changes.join('\n') : '= demo data already present');
    console.log('Demo data seed complete');
}

main()
    .catch(e => { console.error('Demo data seed failed:', e.message); process.exitCode = 1; })
    .finally(() => db.end());
