// Identity verification (provider-based) + OTP. Every call needs the registration ticket from /voters/register;
// the voter id comes from that ticket, never from the request body.
const express = require('express');
const router = express.Router();
const identity = require('../services/identity');
const audit = require('../config/audit');
const tokens = require('../config/tokens');
const rateLimit = require('../middleware/rateLimit');

const requireReg = (req, res, next) => {
    const id = tokens.verify('reg', tokens.bearer(req));
    if (!id) return res.status(401).json({ success: false, code: 'REG_SESSION', message: 'Registration session expired. Please start again.' });
    req.voterId = id; next();
};
const handle = fn => async (req, res) => {
    try { res.json({ success: true, ...(await fn(req)) }); }
    catch (e) {
        if (!e.status) { console.error('identity error:', e.message); return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Server error. Please try again.' }); }
        res.status(e.status).json({ success: false, code: e.code, message: e.message, retry_after: e.retry_after });
    }
};

router.get('/status', requireReg, handle(async req => ({ ...(await identity.getVerificationStatus(req.voterId)), ...identity.info() })));

router.post('/start', rateLimit('idv-start', 20, 15 * 60 * 1000), requireReg, handle(async req => {
    const s = await identity.startVerification(req.voterId, req.body?.contact);
    await audit(req.voterId, 'IDENTITY_STARTED');
    return s;
}));
router.post('/send-otp', rateLimit('idv-send', 15, 15 * 60 * 1000), requireReg, handle(async req => {
    const r = await identity.sendOtp(req.voterId, req.body?.contact);
    await audit(req.voterId, 'OTP_SENT');
    return r;
}));
router.post('/verify-otp', rateLimit('idv-verify', 30, 15 * 60 * 1000), requireReg, handle(async req => {
    try {
        const r = await identity.verifyOtp(req.voterId, req.body?.contact, req.body?.otp);
        await audit(req.voterId, 'IDENTITY_VERIFIED');
        return r;
    } catch (e) { if (e.code === 'OTP_WRONG' || e.code === 'OTP_ATTEMPTS') await audit(req.voterId, 'OTP_FAILED'); throw e; }
}));

module.exports = router;
