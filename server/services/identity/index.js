// IdentityVerificationService – provider-agnostic. Policy lives here (expiry, retry limit,
// resend cooldown, status); the provider only dispatches and checks the code.
// Never stores or logs government ID numbers, OTPs or full phone numbers.
const crypto = require('crypto');
const db = require('../../config/db');

const OTP_TTL_MS = 5 * 60 * 1000, COOLDOWN_MS = 30 * 1000, MAX_ATTEMPTS = 5, MAX_SENDS = 5;
const PHONE_RE = /^[6-9]\d{9}$/;

const mode = () => (process.env.IDENTITY_MODE || 'required').toLowerCase();   // required | off
const providerName = () => (process.env.IDENTITY_PROVIDER || 'mock').toLowerCase();
function provider() {
    const p = providerName();
    if (p === 'mock') {
        if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_IDENTITY !== 'true')
            throw Object.assign(new Error('Mock identity provider is disabled in production'), { status: 503, code: 'IDENTITY_UNAVAILABLE' });
        return require('./mockProvider');
    }
    throw Object.assign(new Error(`Unknown IDENTITY_PROVIDER "${p}"`), { status: 503, code: 'IDENTITY_UNAVAILABLE' });
}
const hashContact = c => crypto.createHash('sha256').update(`bbv-contact:${c}`).digest('hex');
const mask = c => `******${c.slice(-4)}`;
const err = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });

const row = async voter_id => (await db.query("SELECT * FROM identity_verifications WHERE voter_id = ?", [voter_id]))[0][0];

module.exports = {
    mode, providerName, PHONE_RE,
    info: () => { const p = (() => { try { return provider(); } catch { return null; } })();
        return { mode: mode(), provider: providerName(), development: !!p?.development, label: p?.label || null, otp_length: 6, otp_ttl_seconds: OTP_TTL_MS / 1000, resend_cooldown_seconds: COOLDOWN_MS / 1000 }; },

    async startVerification(voter_id, contact) {
        if (!PHONE_RE.test(String(contact || ''))) throw err(400, 'PHONE_INVALID', 'Enter a valid 10-digit mobile number.');
        provider();
        await db.query(
            `INSERT INTO identity_verifications (voter_id, provider, status, contact_hash, contact_masked)
             VALUES (?, ?, 'PENDING', ?, ?)
             ON DUPLICATE KEY UPDATE provider=VALUES(provider), status=IF(status='VERIFIED','VERIFIED',VALUES(status)),
               contact_hash=IF(status='VERIFIED',contact_hash,VALUES(contact_hash)), contact_masked=IF(status='VERIFIED',contact_masked,VALUES(contact_masked))`,
            [voter_id, providerName(), hashContact(contact), mask(contact)]);
        return this.getVerificationStatus(voter_id);
    },

    // contact is needed again because only its hash is stored; it is checked against that hash.
    async sendOtp(voter_id, contact) {
        const r = await row(voter_id);
        if (!r) throw err(409, 'IDENTITY_NOT_STARTED', 'Start identity verification first.');
        if (r.status === 'VERIFIED') return { already_verified: true };
        if (!PHONE_RE.test(String(contact || '')) || hashContact(contact) !== r.contact_hash) throw err(400, 'PHONE_MISMATCH', 'Mobile number does not match the one you entered.');
        if (r.sends >= MAX_SENDS) throw err(429, 'OTP_SEND_LIMIT', 'Too many OTP requests. Please contact an administrator.');
        const wait = r.last_sent_at ? COOLDOWN_MS - (Date.now() - new Date(r.last_sent_at).getTime()) : 0;
        if (wait > 0) throw err(429, 'OTP_COOLDOWN', `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another OTP.`, { retry_after: Math.ceil(wait / 1000) });
        const res = await provider().sendOtp(contact, { voter_id });
        await db.query("UPDATE identity_verifications SET status='PENDING', attempts=0, sends=sends+1, last_sent_at=?, otp_expires_at=? WHERE voter_id=?",
            [new Date(), new Date(Date.now() + OTP_TTL_MS), voter_id]);
        return { sent: true, masked: r.contact_masked, expires_in: OTP_TTL_MS / 1000, resend_in: COOLDOWN_MS / 1000, dev_hint: res.dev_hint };
    },

    async verifyOtp(voter_id, contact, otp) {
        const r = await row(voter_id);
        if (!r) throw err(409, 'IDENTITY_NOT_STARTED', 'Start identity verification first.');
        if (r.status === 'VERIFIED') return { verified: true };
        if (!r.otp_expires_at) throw err(409, 'OTP_NOT_SENT', 'Request an OTP first.');
        if (new Date(r.otp_expires_at) < new Date()) { await db.query("UPDATE identity_verifications SET status='EXPIRED' WHERE voter_id=?", [voter_id]); throw err(400, 'OTP_EXPIRED', 'The OTP has expired. Request a new one.'); }
        if (r.attempts >= MAX_ATTEMPTS) throw err(429, 'OTP_ATTEMPTS', 'Too many wrong attempts. Request a new OTP.');
        if (!/^\d{6}$/.test(String(otp || ''))) throw err(400, 'OTP_FORMAT', 'Enter the 6-digit OTP.');
        if (!PHONE_RE.test(String(contact || '')) || hashContact(contact) !== r.contact_hash) throw err(400, 'PHONE_MISMATCH', 'Mobile number does not match the one you entered.');
        const ok = await provider().checkOtp(contact, otp, { voter_id });
        if (!ok) {
            await db.query("UPDATE identity_verifications SET attempts=attempts+1 WHERE voter_id=?", [voter_id]);
            throw err(400, 'OTP_WRONG', `Incorrect OTP. ${Math.max(0, MAX_ATTEMPTS - r.attempts - 1)} attempt(s) left.`);
        }
        await db.query("UPDATE identity_verifications SET status='VERIFIED', verified_at=?, otp_expires_at=NULL WHERE voter_id=?", [new Date(), voter_id]);
        return { verified: true };
    },

    async getVerificationStatus(voter_id) {
        const r = await row(voter_id);
        return { status: r ? r.status : 'NOT_STARTED', verified: r?.status === 'VERIFIED', masked: r?.contact_masked || null, provider: r?.provider || null };
    },
    async isVerified(voter_id) { return (await this.getVerificationStatus(voter_id)).verified; }
};
