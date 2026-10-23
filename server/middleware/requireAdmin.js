const { configured, verifyToken } = require('../config/adminAuth');
module.exports = (req, res, next) => {
    if (!configured()) return res.status(503).json({ success: false, message: 'Admin access is not configured on the server' });
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m || !verifyToken(m[1])) return res.status(401).json({ success: false, message: 'Admin authentication required' });
    next();
};
