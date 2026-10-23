// Usage:  node scripts/hash-admin-password.js "your-strong-password"
// Prints the two values to paste into server/.env (never commit .env).
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Provide a password of at least 10 characters.'); process.exit(1); }
const salt = crypto.randomBytes(16);
console.log(`ADMIN_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`);
console.log(`ADMIN_TOKEN_SECRET=${crypto.randomBytes(32).toString('hex')}`);
