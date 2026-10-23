// The current election and the rule "voting is possible only while start <= now <= end".
const db = require('./db');

const effectiveStatus = (e, now = new Date()) => {
    if (!e) return 'DRAFT';
    if (e.status === 'DRAFT' || e.status === 'ENDED') return e.status;
    if (!e.start_time || !e.end_time) return 'DRAFT';
    if (now < new Date(e.start_time)) return 'SCHEDULED';
    if (now > new Date(e.end_time)) return 'ENDED';
    return 'ACTIVE';
};

async function current() {
    const [rows] = await db.query("SELECT * FROM elections ORDER BY election_id DESC LIMIT 1");
    const e = rows[0];
    if (!e) return null;
    return { ...e, effective_status: effectiveStatus(e), open: effectiveStatus(e) === 'ACTIVE' };
}
module.exports = { current, effectiveStatus };
