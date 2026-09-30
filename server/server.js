require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const ai = require('./config/ai');

const app = express();

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/voters', require('./routes/voterRoutes'));
app.use('/api/votes', require('./routes/voteRoutes'));

app.get('/', (req, res) => res.json({ message: 'BlockBioVote Server Running ✅' }));

// Reports the state of each dependency – handy for verifying setup.
app.get('/api/health', async (req, res) => {
    const status = { server: 'ok', database: 'down', ai_service: 'down' };
    try { await db.query('SELECT 1'); status.database = 'ok'; } catch (e) { /* keep 'down' */ }
    try { const r = await ai.get('/health'); if (r.status === 200) status.ai_service = 'ok'; } catch (e) { /* keep 'down' */ }
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
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
