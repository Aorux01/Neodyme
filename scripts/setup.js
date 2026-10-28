const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const say = (message) => console.log(`[setup] ${message}`);

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
    console.error(`[setup] Node.js 18 or newer is required (found ${process.versions.node}).`);
    process.exit(1);
}
say(`Node.js ${process.versions.node}`);

if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) {
    say('Installing dependencies...');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) {
        console.error('[setup] npm install failed.');
        process.exit(result.status || 1);
    }
} else {
    say('Dependencies already installed.');
}

const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
    const secret = () => crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(envPath, `jwtSecret=${secret()}\ngameServerSecret=${secret()}\ntfaKey=${secret()}\n`);
    say('Created .env with fresh secrets. Back it up with the rest of your data.');
} else {
    say('.env already exists.');
}

if (!fs.existsSync(path.join(root, 'server.properties'))) {
    console.error('[setup] server.properties is missing. Restore it from the project files.');
    process.exit(1);
}
say('server.properties found.');

say('Done. Start the server with: npm start');
