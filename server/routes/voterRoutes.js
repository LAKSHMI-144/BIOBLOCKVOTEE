const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/db');
const ai = require('../config/ai');
const audit = require('../config/audit');
const tokens = require('../config/tokens');
const identity = require('../services/identity');
const liveness = require('../services/liveness');
const { FRAME_COUNT, FAST_AUTH_FRAME_COUNT } = liveness;
// Registration can skip its extra liveness challenge only in explicitly configured non-production demos.
const REGISTRATION_LIVENESS_REQUIRED = process.env.NODE_ENV === 'production';
const FACE_ONLY_DEMO = process.env.NODE_ENV !== 'production' && process.env.DEMO_FACE_ONLY === 'true';
const requireAdmin = require('../middleware/requireAdmin');
const rateLimit = require('../middleware/rateLimit');

const VOTER_ID_RE = /^[A-Z0-9-]{4,20}$/;
const NAME_RE = /^\p{L}[\p{L}\p{M}\s.'-]{1,98}$/u;
const GENDERS = ['Male', 'Female', 'Other'];
const MIN_AGE = 18, MAX_AGE = 120;
const PENDING_RECLAIM_MS = 60 * 60 * 1000;      // an abandoned half-finished registration frees its ID after 1 hour
const MIN_IMAGES = 3, MAX_IMAGES = 5, MAX_IMAGE_CHARS = 3 * 1024 * 1024;
const B64_RE = /^[A-Za-z0-9+/=\s]+$/;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
// Field-level validation errors: { field: { code, message } } – the UI shows each beside its field.
const fieldFail = (res, status, errors) => {
    const first = Object.values(errors)[0];
    return res.status(status).json({ success: false, code: first.code, message: first.message, errors });
};
const validImage = s => typeof s === 'string' && s.length > 100 && s.length <= MAX_IMAGE_CHARS && B64_RE.test(s);

// Same rules the browser applies – the server never trusts the browser's validation.
function validateDetails(body) {
    const demo_identity_number = String(body.demo_identity_number ?? '').trim();
    const district = String(body.district ?? '').trim();
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
    const address = String(body.address ?? '').trim();
    const gender = String(body.gender ?? '').trim();
    const ageRaw = typeof body.age === 'string' ? body.age.trim() : body.age;
    const age = ageRaw === '' || ageRaw === null || ageRaw === undefined ? NaN : Number(ageRaw);
    const e = {};
    if (!/^\d{12}$/.test(demo_identity_number)) e.demo_identity_number = { code: 'DEMO_ID_INVALID', message: 'Enter a valid 12-digit synthetic demo identity number.' };
    if (!district || district.length > 100) e.district = { code: 'DISTRICT_REQUIRED', message: 'Enter your district.' };
    if (!name) e.name = { code: 'NAME_REQUIRED', message: 'Please enter your full name.' };
    else if (name.length < 2 || name.length > 100 || !NAME_RE.test(name) || (name.match(/\p{L}/gu) || []).length < 2)
        e.name = { code: 'NAME_INVALID', message: 'Enter a valid full name (letters, spaces, . - \' only).' };
    if (ageRaw === '' || ageRaw === null || ageRaw === undefined) e.age = { code: 'AGE_REQUIRED', message: 'Please enter your age.' };
    else if (!Number.isInteger(age) || age > MAX_AGE || age < 1) e.age = { code: 'AGE_INVALID', message: 'Enter a valid age.' };
    else if (age < MIN_AGE) e.age = { code: 'AGE_MIN', message: 'Age must be 18 or above.' };
    if (!address) e.address = { code: 'ADDRESS_REQUIRED', message: 'Please enter your address.' };
    else if (address.length < 5) e.address = { code: 'ADDRESS_SHORT', message: 'Please enter your full address.' };
    else if (address.length > 500) e.address = { code: 'ADDRESS_LONG', message: 'Address is too long.' };
    if (!GENDERS.includes(gender)) e.gender = { code: 'GENDER_INVALID', message: 'Please select a gender.' };
    return { demo_identity_number, district, name, age, gender, address, errors: e };
}

// Optional constituency the voter declares. It is never inferred; if given it must exist, be active and sit in the stated state.
async function resolveLocation(body) {
    const cid = body.constituency_id === undefined || body.constituency_id === null || body.constituency_id === '' ? null : Number(body.constituency_id);
    const sid = body.state_id === undefined || body.state_id === null || body.state_id === '' ? null : Number(body.state_id);
    if (cid === null) {
        if (sid !== null && !Number.isInteger(sid)) return { error: { state_id: { code: 'STATE_INVALID', message: 'Select a valid state.' } } };
        if (sid !== null) { const [r] = await db.query('SELECT state_id FROM states WHERE state_id = ?', [sid]); if (!r.length) return { error: { state_id: { code: 'STATE_INVALID', message: 'Select a valid state.' } } }; }
        return { state_id: sid, constituency_id: null };
    }
    if (!Number.isInteger(cid)) return { error: { constituency_id: { code: 'CONSTITUENCY_INVALID', message: 'Select a valid constituency.' } } };
    const [r] = await db.query('SELECT state_id FROM constituencies WHERE constituency_id = ? AND is_active', [cid]);
    if (!r.length || (sid !== null && r[0].state_id !== sid)) return { error: { constituency_id: { code: 'CONSTITUENCY_INVALID', message: 'That constituency does not belong to the selected state.' } } };
    return { state_id: r[0].state_id, constituency_id: cid };
}

// Registration ticket: proves this browser started the registration for voter_id.
function regVoter(req) {
    const id = tokens.verify('reg', tokens.bearer(req));
    return id && VOTER_ID_RE.test(id) ? id : null;
}
const requireReg = (req, res, next) => {
    const id = regVoter(req);
    if (!id) return fail(res, 401, 'Registration session expired. Please start again.', { code: 'REG_SESSION' });
    req.regVoter = id; next();
};

// Step 1 – details. Reserve a sequential ID; show it only after face registration succeeds.
router.post('/register', rateLimit('register', 30, 15 * 60 * 1000), async (req, res) => {
    const v = validateDetails(req.body || {});
    if (Object.keys(v.errors).length) return fieldFail(res, 400, v.errors);
    const loc = await resolveLocation(req.body || {});
    if (loc.error) return fieldFail(res, 400, loc.error);
    const demoIdentityHash = crypto.createHash('sha256').update(`BIOBLOCKVOTE-DEMO-ID:${v.demo_identity_number}`).digest('hex');
    const demoIdentityMasked = `********${v.demo_identity_number.slice(-4)}`;
    const connection = await db.getConnection();
    let voter_id;
    try {
        await connection.beginTransaction();
        const [duplicate] = await connection.query('SELECT voter_id FROM voters WHERE demo_identity_hash = ? LIMIT 1 FOR UPDATE', [demoIdentityHash]);
        if (duplicate.length) {
            await connection.rollback();
            return fieldFail(res, 409, { demo_identity_number: { code: 'DEMO_ID_EXISTS', message: 'This demo identity number is already registered.' } });
        }
        const [counters] = await connection.query("SELECT next_value FROM voter_id_counters WHERE sequence_name = 'voter' FOR UPDATE");
        if (!counters.length) throw Object.assign(new Error('Voter ID counter missing. Run npm run migrate.'), { code: 'DB_SCHEMA' });
        voter_id = `V${String(counters[0].next_value).padStart(3, '0')}`;
        await connection.query("UPDATE voter_id_counters SET next_value = next_value + 1 WHERE sequence_name = 'voter'");
        await connection.query(
            "INSERT INTO voters (voter_id, name, age, gender, address, district, demo_identity_hash, demo_identity_masked, state_id, constituency_id, is_eligible, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)",
            [voter_id, v.name, v.age, v.gender, v.address, v.district, demoIdentityHash, demoIdentityMasked, loc.state_id, loc.constituency_id, new Date()]
        );
        await connection.commit();
    } catch (e) {
        await connection.rollback();
        if (e.code === 'ER_DUP_ENTRY') return fieldFail(res, 409, { demo_identity_number: { code: 'DEMO_ID_EXISTS', message: 'This demo identity number is already registered.' } });
        console.error('register error:', e.message);
        const schema = ['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE', 'DB_SCHEMA'].includes(e.code);
        return fail(res, 500, schema ? 'Database schema is out of date. Run npm run migrate in the server folder.' : 'Registration failed. Please try again.',
            { code: schema ? 'DB_SCHEMA' : 'SERVER_ERROR' });
    } finally {
        connection.release();
    }
    await audit(voter_id, 'REGISTERED');
    return res.json({ success: true, voter_id, registration_token: tokens.signReg(voter_id), message: 'Details saved. Continue with demo OTP verification.' });
});

// Registration-only liveness challenge using the same PAD and facial-action model as login.
router.post('/register-liveness-challenge', rateLimit('register-liveness-challenge', 20, 10 * 60 * 1000), requireReg, async (req, res) => {
    try {
        if (identity.mode() === 'required' && !(await identity.isVerified(req.regVoter)))
            return fail(res, 403, 'Verify the demo OTP before face registration.', { code: 'IDENTITY_REQUIRED' });
        const challenge = liveness.createChallenge();
        await db.query(
            'INSERT INTO liveness_challenges (token_hash, voter_id, actions, expires_at) VALUES (?, ?, ?, ?)',
            [liveness.hashChallengeToken(challenge.token), req.regVoter, JSON.stringify(challenge.actions), new Date(Date.now() + 90 * 1000)]
        );
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, challenge_token: challenge.token, actions: challenge.actions, frame_count: challenge.frame_count, expires_in: 90 });
    } catch (e) {
        console.error('registration liveness challenge error:', e.message);
        return fail(res, 503, 'Could not start the registration camera challenge. Please try again.', { code: 'LIVENESS_SERVICE_ERROR' });
    }
});

// Verify randomized camera frames and save a one-use proof tied to the exact identity frame.
router.post('/check-registration-liveness', rateLimit('check-registration-liveness', 20, 10 * 60 * 1000), requireReg, async (req, res) => {
    const { challenge_token: challengeToken, frames } = req.body || {};
    const tokenHash = liveness.hashChallengeToken(challengeToken);
    if (!tokenHash || !liveness.validateFrames(frames, FRAME_COUNT))
        return fail(res, 400, 'The camera challenge data is invalid. Start again.', { code: 'INVALID_LIVENESS_DATA' });
    try {
        const actions = await liveness.consumeChallenge(db, tokenHash, req.regVoter);
        if (!actions) return fail(res, 401, 'The camera challenge expired or was already used. Start again.', { code: 'LIVENESS_CHALLENGE_INVALID' });
        livenessStage = 'call Python /liveness-check';
        const liveRes = await ai.post('/liveness-check', { frames, actions }, { timeout: 90000 });
        const identityFrameIndex = liveRes.data?.identity_frame_index;
        if (!liveRes.data?.success || !liveness.isIdentityFrameIndex(identityFrameIndex, frames.length))
            return res.status(403).json({ success: false, code: liveRes.data?.code || 'LIVENESS_FAILED', message: liveRes.data?.message || 'The camera challenge was not passed.' });
        livenessStage = 'save one-use liveness proof in MySQL';
        const verificationToken = liveness.createVerificationToken();
        const saved = await liveness.storeLivenessPass(
            db, tokenHash, req.regVoter,
            liveness.hashChallengeToken(verificationToken),
            liveness.hashFrame(frames[identityFrameIndex])
        );
        if (!saved) return fail(res, 401, 'The camera challenge expired. Start again.', { code: 'LIVENESS_CHALLENGE_INVALID' });
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, liveness_passed: true, liveness_token: verificationToken, identity_frame_index: identityFrameIndex });
    } catch (e) {
        console.error('registration liveness check error:', e.message);
        return fail(res, 503, 'Liveness verification is unavailable. Check the camera service and try again.', { code: 'LIVENESS_SERVICE_ERROR' });
    }
});

// Live per-frame feedback during capture. Nothing is stored.
router.post('/check-face', rateLimit('check-face', 240, 10 * 60 * 1000), async (req, res) => {
    try {
        const { image } = req.body || {};
        if (!validImage(image)) return fail(res, 400, "Invalid image", { code: 'INVALID_IMAGE' });
        const r = await ai.post('/check-face', { image });
        res.status(r.status).json(r.data);
    } catch (e) {
        fail(res, 503, "Face service is unavailable. Please try again shortly.");
    }
});

// Step 3 – face template. Needs the registration ticket and (when enabled) a verified identity.
// Images are forwarded to the AI service, turned into an encrypted embedding and discarded.
router.post('/register-face', rateLimit('register-face', 20, 15 * 60 * 1000), requireReg, async (req, res) => {
    try {
        const body = req.body || {};
        const voter_id = req.regVoter;
        if (body.voter_id && String(body.voter_id).trim().toUpperCase() !== voter_id) return fail(res, 403, 'This registration session belongs to a different Voter ID.', { code: 'ID_MISMATCH' });
        const images = body.images;
        const livenessTokenHash = liveness.hashChallengeToken(body.liveness_token);
        if (REGISTRATION_LIVENESS_REQUIRED && (!livenessTokenHash || !validImage(body.liveness_frame))) return fail(res, 400, 'Complete the live-face challenge before registering your face.', { code: 'INVALID_LIVENESS_DATA' });
        if (!Array.isArray(images) || images.length < MIN_IMAGES || images.length > MAX_IMAGES || !images.every(validImage))
            return fail(res, 400, `Send ${MIN_IMAGES}-${MAX_IMAGES} valid face images`, { code: 'INVALID_IMAGE' });

        const [voter] = await db.query("SELECT voter_id FROM voters WHERE voter_id = ?", [voter_id]);
        if (voter.length === 0) return fail(res, 404, "Register voter details first");
        if (identity.mode() === 'required' && !(await identity.isVerified(voter_id)))
            return fail(res, 403, 'Verify the demo OTP before registering your face.', { code: 'IDENTITY_REQUIRED' });
        if (REGISTRATION_LIVENESS_REQUIRED) {
            const live = await liveness.consumeLivenessPass(db, livenessTokenHash, voter_id, body.liveness_frame);
            if (!live) return fail(res, 403, 'Your live-face check expired or did not match. Start the challenge again.', { code: 'LIVENESS_CHALLENGE_INVALID' });
        }
        const r = await ai.post('/register-face', { voter_id, images });
        if (r.status === 403) { console.error('AI service rejected INTERNAL_API_KEY – check both .env files'); await audit(voter_id, 'FACE_REGISTRATION_FAILED:AI_MISCONFIGURED'); return fail(res, 503, "Face service is misconfigured. Ask the administrator to check INTERNAL_API_KEY in server/.env and python_ai/.env.", { code: 'AI_MISCONFIGURED' }); }
        if (r.data && r.data.success === true && r.status === 200) {
            await audit(voter_id, 'FACE_REGISTERED');
            return res.status(200).json({ ...r.data, voter_id });
        }
        if (r.data && r.data.code) await audit(voter_id, `FACE_REGISTRATION_FAILED:${r.data.code}`);
        return res.status(r.status).json(r.data);
    } catch (e) {
        console.error('register-face error:', e.message);
        await audit(req.regVoter, 'FACE_REGISTRATION_FAILED:AI_UNAVAILABLE');
        fail(res, 503, "Face service is unavailable. Please try again shortly.");
    }
});

router.post('/liveness-challenge', rateLimit('liveness-challenge', 20, 10 * 60 * 1000), async (req, res) => {
    const voterId = String(req.body?.voter_id ?? '').trim().toUpperCase();
    if (!VOTER_ID_RE.test(voterId))
        return fail(res, 400, 'Enter a valid Voter ID.', { code: 'ID_FORMAT' });
    try {
        const [rows] = await db.query(
            'SELECT is_eligible, has_voted, face_encoding IS NOT NULL AS has_face FROM voters WHERE voter_id = ?',
            [voterId]
        );
        if (!rows.length || !rows[0].has_face)
            return fail(res, 404, 'Voter ID or face registration was not found.', { code: 'VOTER_NOT_FOUND' });
        if (!rows[0].is_eligible)
            return fail(res, 403, 'This voter is not eligible to vote.', { code: 'NOT_ELIGIBLE' });
        if (rows[0].has_voted)
            return fail(res, 409, 'This voter has already voted.', { code: 'ALREADY_VOTED' });

        await db.query(
            'DELETE FROM liveness_challenges WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
        );
        const challenge = liveness.createChallenge(FAST_AUTH_FRAME_COUNT);
        await db.query(
            'INSERT INTO liveness_challenges (token_hash, voter_id, actions, expires_at) VALUES (?, ?, ?, ?)',
            [liveness.hashChallengeToken(challenge.token), voterId, JSON.stringify(challenge.actions), new Date(Date.now() + 90 * 1000)]
        );
        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            challenge_token: challenge.token,
            actions: challenge.actions,
            frame_count: challenge.frame_count,
            expires_in: 90
        });
    } catch (e) {
        console.error('liveness challenge error:', e.message);
        fail(res, 503, 'Could not start camera verification. Please try again.', { code: 'LIVENESS_SERVICE_ERROR' });
    }
});

router.post('/check-liveness', rateLimit('check-liveness', 20, 10 * 60 * 1000), async (req, res) => {
    const { challenge_token: challengeToken, frames, voter_id: claimed } = req.body || {};
    const typed = String(claimed ?? '').trim().toUpperCase();
    const tokenHash = liveness.hashChallengeToken(challengeToken);
    if (!VOTER_ID_RE.test(typed))
        return fail(res, 400, 'Enter a valid Voter ID.', { code: 'ID_FORMAT' });
    if (!tokenHash || !liveness.validateFrames(frames, FAST_AUTH_FRAME_COUNT))
        return fail(res, 400, 'The camera challenge data is invalid. Start again.', { code: 'INVALID_LIVENESS_DATA' });

    let livenessStage = 'consume one-time challenge from MySQL';
    try {
        const actions = await liveness.consumeChallenge(db, tokenHash, typed);
        if (!actions) {
            await audit(typed, 'AUTH_FAILED:LIVENESS_CHALLENGE_INVALID');
            return fail(res, 401, 'The camera challenge expired or was already used. Start again.', { code: 'LIVENESS_CHALLENGE_INVALID' });
        }

        const liveRes = await ai.post('/liveness-check', { frames, actions }, { timeout: 90000 });
        if (liveRes.status >= 500 || liveRes.status === 403) {
            await audit(typed, 'AUTH_FAILED:LIVENESS_SERVICE_ERROR');
            return fail(res, 503, 'Liveness verification is temporarily unavailable.', { code: 'LIVENESS_SERVICE_ERROR' });
        }
        const identityFrameIndex = liveRes.data?.identity_frame_index;
        if (
            !liveRes.data?.success
            || !liveness.isIdentityFrameIndex(identityFrameIndex, frames.length)
        ) {
            await audit(typed, `AUTH_FAILED:${liveRes.data?.code || 'LIVENESS_FAILED'}`);
            return res.status(403).json({
                success: false,
                code: liveRes.data?.code || 'LIVENESS_FAILED',
                message: liveRes.data?.message || 'The camera challenge was not passed.'
            });
        }
        const verificationToken = liveness.createVerificationToken();
        const saved = await liveness.storeLivenessPass(
            db,
            tokenHash,
            typed,
            liveness.hashChallengeToken(verificationToken),
            liveness.hashFrame(frames[identityFrameIndex])
        );
        if (!saved) {
            await audit(typed, 'AUTH_FAILED:LIVENESS_PROOF_STORE_FAILED');
            return fail(res, 401, 'The camera verification expired. Start again.', { code: 'LIVENESS_CHALLENGE_INVALID' });
        }
        res.set('Cache-Control', 'no-store');
        return res.json({
            success: true,
            liveness_passed: true,
            liveness_token: verificationToken,
            identity_frame_index: identityFrameIndex
        });
    } catch (e) {
        console.error('liveness verification error:', {
            stage: livenessStage,
            code: e.code || null,
            message: e.message,
            python_status: e.response?.status || null,
            python_code: e.response?.data?.code || null,
            python_message: e.response?.data?.message || null
        });
        await audit(typed, 'AUTH_FAILED:LIVENESS_UNAVAILABLE');
        return fail(res, 503, 'Liveness verification is unavailable. Check the camera service and try again.', {
            code: 'LIVENESS_SERVICE_ERROR'
        });
    }
});

// The one-use liveness proof is bound to the exact frontal frame from the challenge before ArcFace can issue a voter session.
router.post('/authenticate', rateLimit('authenticate', 30, 10 * 60 * 1000), async (req, res) => {
    const { liveness_token: livenessToken, image, voter_id: claimed } = req.body || {};
    const typed = String(claimed ?? '').trim().toUpperCase();
    const verificationHash = liveness.hashChallengeToken(livenessToken);
    if (!VOTER_ID_RE.test(typed))
        return fail(res, 400, 'Enter a valid Voter ID.', { code: 'ID_FORMAT' });
    if (!validImage(image) || (!FACE_ONLY_DEMO && !verificationHash))
        return fail(res, 400, 'The face verification data is invalid. Start again.', { code: 'INVALID_LIVENESS_DATA' });

    let livenessPassed = false;
    try {
        if (!FACE_ONLY_DEMO) {
            livenessPassed = await liveness.consumeLivenessPass(db, verificationHash, typed, image);
            if (!livenessPassed) {
                await audit(typed, 'AUTH_FAILED:LIVENESS_PROOF_INVALID');
                return fail(res, 401, 'Face verification expired or the camera frame changed. Start again.', {
                    code: 'LIVENESS_CHALLENGE_INVALID'
                });
            }
        }

        const [voterRows] = await db.query(
            'SELECT is_eligible, has_voted, face_encoding IS NOT NULL AS has_face FROM voters WHERE voter_id = ?',
            [typed]
        );
        if (!voterRows.length || !voterRows[0].has_face)
            return fail(res, 404, 'Voter ID or face registration was not found.', {
                code: 'VOTER_NOT_FOUND', liveness_passed: true
            });
        if (!voterRows[0].is_eligible)
            return fail(res, 403, 'This voter is not eligible to vote.', {
                code: 'NOT_ELIGIBLE', liveness_passed: true
            });
        if (voterRows[0].has_voted)
            return fail(res, 409, 'This voter has already voted.', {
                code: 'ALREADY_VOTED', liveness_passed: true
            });

        const aiRes = await ai.post('/authenticate', { image });
        if (aiRes.status >= 500 || aiRes.status === 403) {
            await audit(typed, 'AUTH_FAILED:AI_ERROR');
            return fail(res, 503, 'Authentication service error. Please try again.', {
                code: 'AI_ERROR', liveness_passed: true
            });
        }
        if (!aiRes.data.success) {
            await audit(typed, `AUTH_FAILED:${aiRes.data.code || 'NOT_RECOGNIZED'}`);
            return res.status(403).json({
                ...aiRes.data,
                code: aiRes.data.code || 'IDENTITY_FAILED',
                liveness_passed: true
            });
        }
        const { voter_id, voter_name, has_voted } = aiRes.data;
        if (typed !== String(voter_id).toUpperCase()) {
            await audit(voter_id, 'AUTH_ID_MISMATCH');
            return res.status(403).json({
                success: false, code: 'ID_MISMATCH', liveness_passed: true,
                message: 'The verified face does not match the Voter ID you entered.'
            });
        }
        if (has_voted) {
            await audit(voter_id, 'DUPLICATE_ATTEMPT');
            return res.status(409).json({
                success: false, already_voted: true, code: 'ALREADY_VOTED',
                liveness_passed: true, message: `${voter_name} has already voted!`
            });
        }
        if (!FACE_ONLY_DEMO && !liveness.isVerificationComplete(livenessPassed, aiRes.data.success))
            return fail(res, 403, 'Both camera liveness and face identity verification are required.', { code: 'VERIFICATION_REQUIRED' });
        await audit(voter_id, FACE_ONLY_DEMO ? 'AUTHENTICATED_FACE_ONLY_DEMO' : 'AUTHENTICATED');
        res.set('Cache-Control', 'no-store');
        res.json({
            ...aiRes.data,
            liveness_passed: livenessPassed,
            verification_mode: FACE_ONLY_DEMO ? 'FACE_ONLY_DEMO' : 'LIVENESS_AND_FACE',
            session_token: tokens.signVoter(voter_id)
        });
    } catch (e) {
        console.error('authenticate error:', e.message);
        await audit(typed, 'AUTH_FAILED:AI_UNAVAILABLE');
        fail(res, 503, 'Authentication service is unavailable. Please try again.', {
            code: 'AI_ERROR',
            liveness_passed: livenessPassed
        });
    }
});

router.get('/all', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT v.voter_id, v.name, v.age, v.gender, v.district, v.demo_identity_masked, v.has_voted, v.is_eligible, v.face_encoding IS NOT NULL AS face_registered,
                COALESCE(i.status, 'NOT_STARTED') AS identity_status, v.registered_at,
                v.state_id, v.constituency_id, s.name AS state_name, k.name AS constituency_name
            FROM voters v LEFT JOIN identity_verifications i ON i.voter_id = v.voter_id
            LEFT JOIN states s ON s.state_id = v.state_id LEFT JOIN constituencies k ON k.constituency_id = v.constituency_id
            WHERE v.face_encoding IS NOT NULL ORDER BY v.registered_at DESC`);
        res.json(rows);
    } catch (e) {
        console.error('voters/all error:', e.message);
        fail(res, 500, "Could not load voters");
    }
});

module.exports = router;
module.exports.requireReg = requireReg;
