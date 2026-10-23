// Short-lived signed tokens (HMAC-SHA256) for non-admin sessions:
//   purpose "reg"   – proves who started a voter registration (so only they can finish it)
//   purpose "voter" – proves a voter passed face verification (binds /votes/cast to that voter)
// Secret: SESSION_SECRET from server/.env. If unset a random per-boot secret is used, which
// is safe but invalidates all sessions whenever the server restarts.
const crypto = require('crypto');
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const usingEphemeral = !process.env.SESSION_SECRET;

const sign = (purpose, voter_id, ttlMs) => {
    const body = Buffer.from(JSON.stringify({ p: purpose, v: voter_id, exp: Date.now() + ttlMs })).toString('base64url');
    const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${mac}`;
};
// Returns the voter_id when the token is genuine, unexpired and for this purpose; otherwise null.
const verify = (purpose, token) => {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [body, mac] = token.split('.');
    const good = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(mac || ''), b = Buffer.from(good);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const d = JSON.parse(Buffer.from(body, 'base64url'));
        return d.p === purpose && d.exp > Date.now() ? d.v : null;
    } catch { return null; }
};
const bearer = req => (/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1];

module.exports = { sign, verify, bearer, usingEphemeral,
    signReg: id => sign('reg', id, 60 * 60 * 1000),
    signVoter: id => sign('voter', id, 15 * 60 * 1000) };
