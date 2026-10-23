require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const ai = require('./config/ai');
const adminAuth = require('./config/adminAuth');

const app = express();

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
// Dev convenience: Vite may pick 5174+ or be opened via 127.0.0.1, so any local port is allowed outside production.
const localDev = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o) || (process.env.NODE_ENV !== 'production' && localDev.test(o))) }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/voters', require('./routes/voterRoutes'));
app.use('/api/votes', require('./routes/voteRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/identity', require('./routes/identityRoutes'));
app.use('/api/geo', require('./routes/geoRoutes'));

// Public, non-secret configuration the UI needs to decide which registration steps to show.
app.get('/api/config', (req, res) => res.json({ identity: require('./services/identity').info() }));

app.get('/', (req, res) => res.json({ message: 'BlockBioVote Server Running ✅' }));

// Reports the state of each dependency – handy for verifying setup.
app.get('/api/health', async (req, res) => {
    const status = { server: 'ok', database: 'down', ai_service: 'down', admin_login: adminAuth.configured() ? 'configured' : 'NOT configured' };
    try { await db.query('SELECT 1'); status.database = 'ok'; } catch (e) { /* keep 'down' */ }
    try {
        const r = await ai.get('/health');
        if (r.status === 200) {
            status.ai_service = 'ok';
            // /health is open; this protected route proves INTERNAL_API_KEY matches in both .env files.
            const k = await ai.get('/blockchain-status');
            if (k.status === 403) status.ai_service = 'INTERNAL_API_KEY mismatch between server/.env and python_ai/.env';
            else if (k.status !== 200) status.ai_service = `ok (protected route returned ${k.status})`;
        }
    } catch (e) { /* keep 'down' */ }
    const healthy = status.database === 'ok' && status.ai_service === 'ok';
    res.status(healthy ? 200 : 503).json(status);
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// Malformed JSON, oversized bodies etc. – never leak internals.
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ success: false, message: status === 413 ? 'Request too large' : status < 500 ? 'Invalid request' : 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
// Bring the schema up to date first (idempotent, never drops data), then accept requests.
require('./config/schema')().then(done => {
    if (done.length) console.log('🛠  Database schema updated:\n   ' + done.join('\n   '));
}).catch(e => {
    console.error(`❌ Database schema check failed: ${e.code || ''} ${e.message}\n   Check DB_* values in server/.env and that MySQL/MariaDB is running.`);
}).finally(() => app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    const miss = adminAuth.missing();
    console.log(miss.length ? `⚠️  Admin login NOT configured - missing in server/.env: ${miss.join(', ')}  (fix: npm run setup-admin -- "your-password")` : '✅ Admin login configured');
    if (require('./config/tokens').usingEphemeral) console.log('ℹ️  SESSION_SECRET not set: voter/registration sessions reset when the server restarts.');
    console.log(`ℹ️  Identity verification: mode=${process.env.IDENTITY_MODE || 'required'} provider=${process.env.IDENTITY_PROVIDER || 'mock'}`);
}));
