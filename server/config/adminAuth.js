// Minimal admin authentication: scrypt password check + short-lived HMAC-signed token.
// Credentials live only in server environment variables (never in Git or React).
const crypto = require('crypto');
const TTL_MS = 2 * 60 * 60 * 1000;

const REQUIRED = ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOKEN_SECRET'];
const missing = () => REQUIRED.filter(k => !process.env[k]);   // names only, never values
const configured = () => missing().length === 0;
const sha = s => crypto.createHash('sha256').update(String(s)).digest();

function verifyPassword(password, stored) {           // stored = scrypt$<saltHex>$<hashHex>
    const [alg, salt, hash] = String(stored || '').split('$');
    if (alg !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
}
const checkCredentials = (u, p) => {
    const userOk = crypto.timingSafeEqual(sha(u), sha(process.env.ADMIN_USERNAME));
    const passOk = verifyPassword(p, process.env.ADMIN_PASSWORD_HASH);   // always evaluated
    return userOk && passOk;
};
const mac = body => crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET).update(body).digest('base64url');

function signToken() {
    const body = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + TTL_MS })).toString('base64url');
    return `${body}.${mac(body)}`;
}
function verifyToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return false;
    const good = mac(body);
    if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
    try { return JSON.parse(Buffer.from(body, 'base64url')).exp > Date.now(); } catch { return false; }
}
module.exports = { configured, missing, checkCredentials, signToken, verifyToken, TTL_MS };
