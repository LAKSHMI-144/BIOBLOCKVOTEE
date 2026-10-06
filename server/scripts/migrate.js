// Idempotent upgrade for databases created from any older schema. Also runs automatically at server start.
//   cd server && npm run migrate
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');
const ensureSchema = require('../config/schema');

ensureSchema().then(done => {
    console.log(done.length ? done.join('\n') : '= schema already up to date');
    console.log('Migration complete');
}).catch(e => { console.error('Migration failed:', e.message); process.exitCode = 1; }).finally(() => db.end());
