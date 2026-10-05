require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

// Client for the Python AI service. Non-2xx responses are passed through
// (validateStatus) so the Node routes can forward Python's error message/code.
const ai = axios.create({
    baseURL: process.env.PYTHON_AI_URL || 'http://localhost:5001',
    timeout: 30000,
    headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY || '' },
    validateStatus: () => true
});

module.exports = ai;
