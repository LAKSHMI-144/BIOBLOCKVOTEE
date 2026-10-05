// Usage (from the server folder):  npm run setup-admin -- "your-strong-password" [username]
// Writes ADMIN_USERNAME / ADMIN_PASSWORD_HASH / ADMIN_TOKEN_SECRET into server/.env (other lines are kept).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const pw = process.argv[2], user = process.argv[3] || 'admin';
if (!pw || pw.length < 10) { console.error('Usage: npm run setup-admin -- "password-of-10+-characters" [username]'); process.exit(1); }
const salt = crypto.randomBytes(16);
const vals = {
    ADMIN_USERNAME: user,
    ADMIN_PASSWORD_HASH: `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`,
    ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
};
const file = path.join(__dirname, '..', '.env');
const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l !== '') : [];
for (const [k, v] of Object.entries(vals)) {
    const i = lines.findIndex(l => l.startsWith(k + '='));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
}
fs.writeFileSync(file, lines.join('\n') + '\n');
console.log(`Admin login saved to server/.env for user "${user}". Restart the server.`);
