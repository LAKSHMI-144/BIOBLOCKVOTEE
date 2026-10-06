const db = require('./db');
// Never put secrets, OTPs, ID numbers or biometric data in `action`.
module.exports = (voter_id, action, actor = 'voter') =>
    db.query("INSERT INTO audit_log (voter_id, action, actor) VALUES (?, ?, ?)", [voter_id, action, actor])
        .catch(e => console.error('audit failed:', e.message));
