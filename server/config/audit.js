const db = require('./db');
// Never put secrets, OTPs, ID numbers, biometric data or a voter's chosen candidate in an audit record.

// An audit action looks like "EVENT_TYPE" or "EVENT_TYPE:detail". The type and outcome are derived once, here,
// so every caller (and every row written before these columns existed) is classified the same way.
const FAILED = /FAIL|REJECT|MISMATCH|WRONG|ATTEMPTS|INVALID|ERROR|UNRECOGNI[SZ]ED|NO_FACE/;
const DENIED = /DUPLICATE|DENIED|NOT_ELIGIBLE|CLOSED|UNAUTHORI[SZ]ED|NO_CONSTITUENCY/;
function classify(action) {
    const a = String(action || '');
    const i = a.indexOf(':');
    let type = i < 0 ? a : a.slice(0, i);
    let details = i < 0 ? null : a.slice(i + 1);
    // Legacy rows stored the chosen candidate next to the voter id. Never surface it.
    if (type === 'VOTED_FOR') { type = 'VOTED'; details = null; }
    const status = DENIED.test(a) ? 'DENIED' : FAILED.test(a) ? 'FAILED' : 'SUCCESS';
    return { type, status, details: details ? details.slice(0, 250) : null };
}

// audit(voter_id, action, actor = 'voter' | 'admin' | 'system', { status, details } = {})
const audit = (voter_id, action, actor = 'voter', opts = {}) => {
    const c = classify(action);
    return db.query(
        "INSERT INTO audit_log (voter_id, action, actor, event_type, status, details) VALUES (?, ?, ?, ?, ?, ?)",
        [voter_id, String(action).slice(0, 200), actor, c.type.slice(0, 60), opts.status || c.status, (opts.details ?? c.details)]
    ).catch(e => console.error('audit failed:', e.message));
};
module.exports = audit;
module.exports.classify = classify;
