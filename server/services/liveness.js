const crypto = require('crypto');

const FRAME_COUNT = 16;
const SUPPORTED_FRAME_COUNTS = new Set([FRAME_COUNT, 24]);
const ACTIONS = ['blink', 'turn_left', 'turn_right'];
const MAX_FRAME_CHARS = 512 * 1024;
const MAX_TOTAL_FRAME_CHARS = 8 * 1024 * 1024;
const FRAME_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

function createChallenge() {
    return {
        token: crypto.randomBytes(32).toString('hex'),
        actions: [ACTIONS[crypto.randomInt(ACTIONS.length)]],
        frame_count: FRAME_COUNT
    };
}

function createVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashChallengeToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
    return crypto.createHash('sha256').update(token, 'ascii').digest('hex');
}

function hashFrame(frame) {
    if (typeof frame !== 'string' || !FRAME_RE.test(frame)) return null;
    return crypto.createHash('sha256').update(frame, 'ascii').digest('hex');
}

function validateFrames(frames) {
    if (!Array.isArray(frames) || !SUPPORTED_FRAME_COUNTS.has(frames.length)) return false;
    let total = 0;
    for (const frame of frames) {
        if (
            typeof frame !== 'string'
            || frame.length < 100
            || frame.length > MAX_FRAME_CHARS
            || !FRAME_RE.test(frame)
        ) return false;
        total += frame.length;
        if (total > MAX_TOTAL_FRAME_CHARS) return false;
    }
    return true;
}

function isIdentityFrameIndex(index, frameCount) {
    return Number.isInteger(index) && index >= 0 && index < frameCount;
}

function isVerificationComplete(livenessPassed, identityPassed) {
    return livenessPassed === true && identityPassed === true;
}

async function consumeChallenge(db, tokenHash, voterId) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT actions FROM liveness_challenges
             WHERE token_hash = ? AND voter_id = ? AND consumed_at IS NULL AND expires_at > NOW()
             FOR UPDATE`,
            [tokenHash, voterId]
        );
        if (!rows.length) {
            await connection.rollback();
            return null;
        }
        const actions = typeof rows[0].actions === 'string'
            ? JSON.parse(rows[0].actions)
            : rows[0].actions;
        const [updated] = await connection.query(
            'UPDATE liveness_challenges SET consumed_at = NOW() WHERE token_hash = ? AND consumed_at IS NULL',
            [tokenHash]
        );
        if (updated.affectedRows !== 1) {
            await connection.rollback();
            return null;
        }
        await connection.commit();
        return actions;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function storeLivenessPass(db, challengeHash, voterId, verificationTokenHash, identityFrameHash) {
    if (![challengeHash, verificationTokenHash, identityFrameHash].every(value => HASH_RE.test(value || '')))
        return false;
    const [result] = await db.query(
        `UPDATE liveness_challenges
         SET verification_token_hash = ?, identity_frame_hash = ?, liveness_passed_at = NOW()
         WHERE token_hash = ? AND voter_id = ? AND consumed_at IS NOT NULL
           AND expires_at > NOW() AND verification_token_hash IS NULL`,
        [verificationTokenHash, identityFrameHash, challengeHash, voterId]
    );
    return result.affectedRows === 1;
}

async function consumeLivenessPass(db, verificationTokenHash, voterId, image) {
    const imageHash = hashFrame(image);
    if (!HASH_RE.test(verificationTokenHash || '') || !imageHash) return false;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT identity_frame_hash FROM liveness_challenges
             WHERE verification_token_hash = ? AND voter_id = ?
               AND liveness_passed_at IS NOT NULL AND expires_at > NOW()
               AND identity_consumed_at IS NULL
             FOR UPDATE`,
            [verificationTokenHash, voterId]
        );
        if (!rows.length || !HASH_RE.test(rows[0].identity_frame_hash || '')) {
            await connection.rollback();
            return false;
        }
        const expected = Buffer.from(rows[0].identity_frame_hash, 'hex');
        const supplied = Buffer.from(imageHash, 'hex');
        if (!crypto.timingSafeEqual(expected, supplied)) {
            await connection.rollback();
            return false;
        }
        const [updated] = await connection.query(
            `UPDATE liveness_challenges SET identity_consumed_at = NOW()
             WHERE verification_token_hash = ? AND identity_consumed_at IS NULL`,
            [verificationTokenHash]
        );
        if (updated.affectedRows !== 1) {
            await connection.rollback();
            return false;
        }
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    FRAME_COUNT,
    ACTIONS,
    createChallenge,
    createVerificationToken,
    hashChallengeToken,
    hashFrame,
    validateFrames,
    isIdentityFrameIndex,
    isVerificationComplete,
    consumeChallenge,
    storeLivenessPass,
    consumeLivenessPass
};
