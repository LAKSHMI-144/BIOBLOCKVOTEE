const test = require('node:test');
const assert = require('node:assert/strict');
const {
    FRAME_COUNT,
    createChallenge,
    hashChallengeToken,
    hashFrame,
    validateFrames,
    isIdentityFrameIndex,
    isVerificationComplete,
    consumeChallenge,
    storeLivenessPass,
    consumeLivenessPass
} = require('../services/liveness');

test('challenges choose one random supported action and use unique unguessable tokens', () => {
    const challenges = Array.from({ length: 64 }, createChallenge);
    const supportedActions = new Set(['blink', 'turn_left', 'turn_right']);
    for (const challenge of challenges) {
        assert.match(challenge.token, /^[a-f0-9]{64}$/);
        assert.equal(challenge.frame_count, FRAME_COUNT);
        assert.equal(challenge.actions.length, 1);
        assert.ok(supportedActions.has(challenge.actions[0]));
    }
    assert.equal(new Set(challenges.map(challenge => challenge.token)).size, challenges.length);
    assert.ok(new Set(challenges.map(challenge => challenge.actions[0])).size > 1);
});

test('challenge hashes cannot be substituted by malformed tokens', () => {
    const { token } = createChallenge();
    assert.equal(hashChallengeToken(token).length, 64);
    assert.equal(hashChallengeToken('not-a-token'), null);
    assert.notEqual(hashChallengeToken(token), token);
});

test('liveness frame payload has a strict count and per-frame/aggregate limits', () => {
    const frame = Buffer.alloc(100, 1).toString('base64');
    assert.equal(validateFrames(Array(FRAME_COUNT).fill(frame)), true);
    assert.equal(validateFrames(Array(24).fill(frame)), true);
    assert.equal(validateFrames(Array(FRAME_COUNT - 1).fill(frame)), false);
    assert.equal(validateFrames(Array(FRAME_COUNT + 1).fill(frame)), false);
    assert.equal(validateFrames([frame, ...Array(FRAME_COUNT - 1).fill('!'.repeat(100))]), false);
    assert.equal(validateFrames(Array(FRAME_COUNT).fill('A'.repeat(512 * 1024 + 1))), false);
});

test('identity frame must be a valid index in the captured challenge', () => {
    assert.equal(isIdentityFrameIndex(0, FRAME_COUNT), true);
    assert.equal(isIdentityFrameIndex(FRAME_COUNT - 1, FRAME_COUNT), true);
    assert.equal(isIdentityFrameIndex(-1, FRAME_COUNT), false);
    assert.equal(isIdentityFrameIndex(FRAME_COUNT, FRAME_COUNT), false);
    assert.equal(isIdentityFrameIndex('0', FRAME_COUNT), false);
});

test('liveness proof is short-lived, voter-bound, single-use, and bound to the final image', async () => {
    const challenge = createChallenge();
    const proof = createChallenge().token;
    const finalFrame = Buffer.alloc(100, 1).toString('base64');
    let consumedChallenge = false;
    let proofHash = null;
    let finalFrameHash = null;
    let identityConsumed = false;
    const connection = {
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        query: async (sql, params) => {
            if (sql.includes('SELECT actions')) {
                const valid = !consumedChallenge
                    && params[0] === hashChallengeToken(challenge.token)
                    && params[1] === 'VOTER-1';
                return [valid ? [{ actions: challenge.actions }] : []];
            }
            if (sql.includes('SET consumed_at')) {
                consumedChallenge = true;
                return [{ affectedRows: 1 }];
            }
            if (sql.includes('SELECT identity_frame_hash')) {
                const valid = !identityConsumed
                    && params[0] === proofHash
                    && params[1] === 'VOTER-1';
                return [valid ? [{ identity_frame_hash: finalFrameHash }] : []];
            }
            if (sql.includes('SET identity_consumed_at')) {
                if (identityConsumed) return [{ affectedRows: 0 }];
                identityConsumed = true;
                return [{ affectedRows: 1 }];
            }
            throw new Error('Unexpected SQL in liveness proof test');
        }
    };
    const pool = {
        getConnection: async () => connection,
        query: async (sql, params) => {
            if (sql.includes('SET verification_token_hash')) {
                proofHash = params[0];
                finalFrameHash = params[1];
                return [{ affectedRows: consumedChallenge ? 1 : 0 }];
            }
            throw new Error('Unexpected pool query in liveness proof test');
        }
    };
    const challengeHash = hashChallengeToken(challenge.token);
    assert.deepEqual(await consumeChallenge(pool, challengeHash, 'VOTER-1'), challenge.actions);
    assert.equal(await storeLivenessPass(
        pool, challengeHash, 'VOTER-1', hashChallengeToken(proof), hashFrame(finalFrame)
    ), true);
    assert.equal(await consumeLivenessPass(pool, hashChallengeToken(proof), 'OTHER-VOTER', finalFrame), false);
    assert.equal(await consumeLivenessPass(pool, hashChallengeToken(proof), 'VOTER-1', Buffer.alloc(100, 2).toString('base64')), false);
    assert.equal(await consumeLivenessPass(pool, hashChallengeToken(proof), 'VOTER-1', finalFrame), true);
    assert.equal(await consumeLivenessPass(pool, hashChallengeToken(proof), 'VOTER-1', finalFrame), false);
});

test('both server-side checks are required before issuing a voter session', () => {
    assert.equal(isVerificationComplete(false, false), false);
    assert.equal(isVerificationComplete(false, true), false);
    assert.equal(isVerificationComplete(true, false), false);
    assert.equal(isVerificationComplete(true, true), true);
});

test('a liveness challenge is voter-bound, expires, and can only be consumed once', async () => {
    const challenge = createChallenge();
    let consumed = false;
    let expired = false;
    let storedVoter = 'VOTER-1';
    const connection = {
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        query: async (sql, params) => {
            if (sql.includes('SELECT actions')) {
                const valid = !expired && !consumed && params[0] === hashChallengeToken(challenge.token) && params[1] === storedVoter;
                return [valid ? [{ actions: challenge.actions }] : []];
            }
            if (sql.includes('UPDATE liveness_challenges')) {
                if (!consumed) {
                    consumed = true;
                    return [{ affectedRows: 1 }];
                }
                return [{ affectedRows: 0 }];
            }
            throw new Error('Unexpected SQL in challenge test');
        }
    };
    const pool = { getConnection: async () => connection };
    const tokenHash = hashChallengeToken(challenge.token);

    assert.equal(await consumeChallenge(pool, tokenHash, 'OTHER-VOTER'), null);
    assert.deepEqual(await consumeChallenge(pool, tokenHash, storedVoter), challenge.actions);
    assert.equal(await consumeChallenge(pool, tokenHash, storedVoter), null);

    consumed = false;
    expired = true;
    assert.equal(await consumeChallenge(pool, tokenHash, storedVoter), null);
});
