// Tiny in-memory rate limiter (per IP, per named bucket). Resets when the server restarts.
const hits = new Map();
module.exports = (name, max, windowMs, message = 'Too many attempts. Try again later.') => (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ success: false, code: 'RATE_LIMITED', message });
    }
    recent.push(now); hits.set(key, recent);
    next();
};
