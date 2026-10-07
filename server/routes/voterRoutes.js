const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ai = require('../config/ai');
const requireAdmin = require('../middleware/requireAdmin');

const VOTER_ID_RE = /^[A-Z0-9-]{4,20}$/;
const GENDERS = ['', 'Male', 'Female', 'Other'];
const MIN_IMAGES = 3, MAX_IMAGES = 5, MAX_IMAGE_CHARS = 3 * 1024 * 1024;
const B64_RE = /^[A-Za-z0-9+/=\s]+$/;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const audit = (voter_id, action) =>
    db.query("INSERT INTO audit_log (voter_id, action) VALUES (?, ?)", [voter_id, action]).catch(e => console.error('audit failed:', e.message));
const validImage = s => typeof s === 'string' && s.length > 100 && s.length <= MAX_IMAGE_CHARS && B64_RE.test(s);

// Step 1 – voter details. Re-submitting for a voter who has NOT yet registered a face
// resumes/updates that pending registration; a fully registered voter is a duplicate.
router.post('/register', async (req, res) => {
    try {
        const body = req.body || {};
        const voter_id = String(body.voter_id || '').trim().toUpperCase();
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const age = Number(body.age);
        const gender = String(body.gender || '').trim();
        const address = String(body.address || '').trim();

        if (!VOTER_ID_RE.test(voter_id)) return fail(res, 400, "Voter ID must be 4-20 letters, digits or hyphens");
        if (name.length < 2 || name.length > 100) return fail(res, 400, "Enter the voter's full name (2-100 characters)");
        if (!Number.isInteger(age) || age < 1 || age > 120) return fail(res, 400, "Enter a valid age");
        if (!GENDERS.includes(gender)) return fail(res, 400, "Invalid gender value");
        if (address.length > 500) return fail(res, 400, "Address is too long");

        // Eligibility rule for now: 18+. (Per-election eligibility arrives with election management.)
        if (age < 18) {
            await audit(voter_id, 'REGISTRATION_REJECTED:UNDERAGE');
            return fail(res, 400, "Must be 18 or older to register");
        }

        const [exist] = await db.query("SELECT face_encoding IS NOT NULL AS has_face FROM voters WHERE voter_id = ?", [voter_id]);
        if (exist.length > 0) {
            if (exist[0].has_face) return fail(res, 409, "Voter ID already registered");
            await db.query("UPDATE voters SET name=?, age=?, gender=?, address=?, is_eligible=TRUE WHERE voter_id=?",
                [name, age, gender, address, voter_id]);
            return res.json({ success: true, resumed: true, voter_id, message: "Registration was incomplete – continue with face capture" });
        }

        try {
            await db.query("INSERT INTO voters (voter_id, name, age, gender, address, is_eligible) VALUES (?, ?, ?, ?, ?, TRUE)",
                [voter_id, name, age, gender, address]);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, "Voter ID already registered");
            throw e;
        }
        await audit(voter_id, 'REGISTERED');
        return res.json({ success: true, voter_id, message: `Voter ${name} registered. Now capture the face.` });
    } catch (e) {
        console.error('register error:', e.message, e.code);
        // Distinguish between different types of errors
        if (e.code === 'ER_BAD_DB_ERROR') {
            return fail(res, 503, "Database is not initialized. Please run 'npm run setup-db' or initialize schema.sql manually.");
        }
        if (e.code === 'ER_NO_SUCH_TABLE' || e.message?.includes("doesn't exist")) {
            return fail(res, 503, "Database tables are not initialized. Admin: run 'npm run setup-db' to initialize the database.");
        }
        if (e.code === 'PROTOCOL_CONNECTION_LOST' || e.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' || e.code === 'ECONNREFUSED') {
            return fail(res, 503, "Cannot connect to database. Ensure MySQL is running and credentials are correct.");
        }
        if (e.code === 'ER_ACCESS_DENIED_ERROR') {
            return fail(res, 503, "Database authentication failed. Check DB_USER and DB_PASSWORD in server/.env");
        }
        // Generic database error
        if (e.message?.includes('database') || e.message?.includes('SQL')) {
            return fail(res, 503, "Database error: " + (e.message || "Unknown database error"));
        }
        // Fallback for unexpected errors
        return fail(res, 500, "Registration failed. Please try again. " + (process.env.NODE_ENV === 'development' ? `(${e.message})` : ""));
    }
});

// Live per-frame feedback during capture. Nothing is stored.
router.post('/check-face', async (req, res) => {
    try {
        const { image } = req.body || {};
        if (!validImage(image)) return fail(res, 400, "Invalid image");
        const r = await ai.post('/check-face', { image });
        res.status(r.status).json(r.data);
    } catch (e) {
        fail(res, 503, "Face service is unavailable. Please try again shortly.");
    }
});

// Step 2 – face template. Images are forwarded to the AI service, turned into an
// encrypted embedding and discarded; no raw image is written anywhere.
router.post('/register-face', async (req, res) => {
    try {
        const body = req.body || {};
        const voter_id = String(body.voter_id || '').trim().toUpperCase();
        const images = body.images;
        if (!VOTER_ID_RE.test(voter_id)) return fail(res, 400, "Invalid voter ID");
        if (!Array.isArray(images) || images.length < MIN_IMAGES || images.length > MAX_IMAGES || !images.every(validImage))
            return fail(res, 400, `Send ${MIN_IMAGES}-${MAX_IMAGES} valid face images`);

        const [voter] = await db.query("SELECT voter_id FROM voters WHERE voter_id = ?", [voter_id]);
        if (voter.length === 0) return fail(res, 404, "Register voter details first");

        const r = await ai.post('/register-face', { voter_id, images });
        if (r.status === 403) { console.error('AI service rejected INTERNAL_API_KEY – check both .env files'); return fail(res, 503, "Face service is misconfigured"); }
        if (r.data && r.data.success) await audit(voter_id, 'FACE_REGISTERED');
        else if (r.data && r.data.code) await audit(voter_id, `FACE_REGISTRATION_FAILED:${r.data.code}`);
        res.status(r.status).json(r.data);
    } catch (e) {
        console.error('register-face error:', e.message || e);
        if (e.code === 'ER_NO_SUCH_TABLE' || e.message?.includes("doesn't exist")) {
            return fail(res, 503, "Database is not properly initialized. Run 'npm run setup-db' to initialize.");
        }
        if (e.code === 'ECONNREFUSED' || e.message?.includes('Cannot connect')) {
            return fail(res, 503, "AI face service is unavailable. Ensure the Python AI service is running on port 5001.");
        }
        if (e.message?.includes('ENOTFOUND') || e.message?.includes('connect')) {
            return fail(res, 503, "Cannot reach AI service. Check that it's running at PYTHON_AI_URL in .env");
        }
        return fail(res, 503, "Face registration service error. Please try again shortly.");
    }
});

router.post('/authenticate', async (req, res) => {
    const { face_image } = req.body || {};
    try {
        const aiRes = await ai.post('/authenticate', { image: face_image });
        if (aiRes.status >= 500 || aiRes.status === 403) return res.json({ success: false, message: "Authentication service error. Please try again." });
        if (!aiRes.data.success) return res.json(aiRes.data);
        const { voter_id, voter_name, has_voted } = aiRes.data;
        if (has_voted) {
            await audit(voter_id, 'DUPLICATE_ATTEMPT');
            return res.json({ success: false, already_voted: true, message: `${voter_name} has already voted!` });
        }
        await audit(voter_id, 'AUTHENTICATED');
        res.json(aiRes.data);
    } catch (e) {
        console.error('authenticate error:', e.message);
        res.json({ success: false, message: "Authentication service is unavailable. Please try again." });
    }
});

router.get('/all', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT voter_id, name, age, has_voted, is_eligible, face_encoding IS NOT NULL AS face_registered, registered_at FROM voters");
        res.json(rows);
    } catch (e) {
        console.error('voters/all error:', e.message);
        fail(res, 500, "Could not load voters");
    }
});

module.exports = router;
