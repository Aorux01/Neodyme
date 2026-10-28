const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');
const TestRegistry = require('../test-registry');
const { PAGES, ACCOUNT_PAGES, RESERVED_PREFIXES } = require('../../../middleware/page-routes-middleware');

const WEB_DIR = path.join(__dirname, '..', '..', '..', '..', 'web');
const HTML_DIR = path.join(WEB_DIR, 'html');

const register = (id, title, run) => TestRegistry.register({ id, group: 'web', title, kind: 'functional', run });

const read = (file) => fs.readFileSync(file, 'utf-8');
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, ext);
    return full.endsWith(ext) ? [full] : [];
});
const rel = (file) => path.relative(WEB_DIR, file).replace(/\\/g, '/');

async function withServer(app, run) {
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
        return await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.close();
    }
}

register('web.pages-exist', 'Every website page has its file', () => {
    const missing = PAGES.filter(name => !fs.existsSync(path.join(HTML_DIR, `${name}.html`)));
    if (missing.length > 0) throw new Error(`Missing page files: ${missing.join(', ')}`);
});

register('web.page-basics', 'Pages declare a viewport and load the shared shell', () => {
    const problems = [];
    for (const file of walk(HTML_DIR, '.html')) {
        const html = read(file);
        if (!html.includes('name="viewport"')) problems.push(`${rel(file)}: no viewport`);
        if (html.includes('class="neodyme-header"') && !html.includes('/js/shell.js')) problems.push(`${rel(file)}: shell.js not loaded`);
    }
    if (problems.length > 0) throw new Error(problems.join('; '));
});

register('web.scripts-compile', 'Website scripts have valid syntax', () => {
    const problems = [];
    for (const file of walk(path.join(WEB_DIR, 'js'), '.js')) {
        try {
            new vm.Script(read(file), { filename: rel(file) });
        } catch (error) {
            problems.push(`${rel(file)}: ${error.message}`);
        }
    }
    if (problems.length > 0) throw new Error(problems.join('; '));
});

register('web.internal-links', 'Internal links point to existing pages and files', () => {
    const docs = fs.readdirSync(path.join(HTML_DIR, 'docs')).map(f => f.replace('.html', ''));
    const known = new Set(['/', ...PAGES.map(p => `/${p}`), '/account', ...ACCOUNT_PAGES.map(p => `/account/${p}`), '/docs',
        ...docs.map(d => `/docs/${d}`)]);
    const broken = [];

    for (const file of walk(HTML_DIR, '.html')) {
        for (const match of read(file).matchAll(/href="(\/[^"#?]*)/g)) {
            const target = match[1].replace(/\/+$/, '') || '/';
            if (target.startsWith('/neodyme/')) continue;
            const isFile = /\.[a-z0-9]+$/i.test(target);
            const exists = isFile
                ? target === '/favicon.ico' || fs.existsSync(path.join(WEB_DIR, target))
                : known.has(target);
            if (!exists) broken.push(`${rel(file)} -> ${target}`);
        }
    }
    if (broken.length > 0) throw new Error(`${broken.length} broken link(s): ${[...new Set(broken)].slice(0, 6).join('; ')}`);
});

register('web.docs-markup', 'Docs have no stray closing tags or removed roles', () => {
    const problems = [];
    for (const file of walk(path.join(HTML_DIR, 'docs'), '.html')) {
        const html = read(file);
        html.split('\n').forEach((line, i) => {
            if (line.includes('</span>') && !line.includes('<span')) problems.push(`${rel(file)}:${i + 1} stray span`);
            const opened = line.split('<td').length - 1;
            const closed = line.split('</td>').length - 1;
            if (opened > closed && line.includes('</tr>')) problems.push(`${rel(file)}:${i + 1} unclosed cell`);
        });
        if (/<code>(founder|helper)<\/code>|<td>(Founder|Helper)<\/td>|Founder\s*[,\/]\s*(Helper|Moderator)|Helper\s*[,\/]\s*Moderator/.test(html)) {
            problems.push(`${rel(file)}: lists a role that does not exist`);
        }
    }
    if (problems.length > 0) throw new Error(problems.slice(0, 6).join('; '));
});

register('web.account-routes', 'Account pages are served and /dashboard redirects', async () => {
    const { pageRoutes } = require('../../../middleware/page-routes-middleware');
    const app = express();
    app.use(pageRoutes(WEB_DIR));

    await withServer(app, async (base) => {
        for (const target of ['/account', ...ACCOUNT_PAGES.map(p => `/account/${p}`)]) {
            const response = await fetch(base + target);
            if (response.status !== 200) throw new Error(`${target} answered ${response.status}`);
        }

        const unknown = await fetch(`${base}/account/not-a-page`);
        if (unknown.status === 200) throw new Error('An unknown account page was served');

        const redirect = await fetch(`${base}/dashboard`, { redirect: 'manual' });
        if (redirect.status !== 302 || redirect.headers.get('location') !== '/account') {
            throw new Error('/dashboard does not redirect to /account');
        }
    });
});

register('web.plugin-route-guard', 'Plugin routes on website paths are detected and blocked', () => {
    const ConfigManager = require('../../../manager/config-manager');
    const PluginRouteGuard = require('../../../utils/plugin-route-guard');
    const previous = ConfigManager.get('pluginRouteGuard');

    try {
        for (const [mode, removed] of [['warn', false], ['block', true]]) {
            ConfigManager.set('pluginRouteGuard', mode);
            const app = express();
            app.get('/existing', (req, res) => res.end());
            const before = PluginRouteGuard.snapshot(app);
            app.get('/dashboard', (req, res) => res.end());
            app.get('/plugins/demo/page', (req, res) => res.end());
            const router = express.Router();
            router.get('/account/profile', (req, res) => res.end());
            app.use('/', router);

            const found = PluginRouteGuard.check(app, before, 'test-plugin');
            if (found.length !== 2) throw new Error(`${mode}: expected 2 conflicts, found ${found.length}`);

            const left = app._router.stack.filter(layer => layer.route).map(layer => layer.route.path);
            if (left.includes('/dashboard') === removed) throw new Error(`${mode}: wrong outcome for /dashboard`);
            if (!left.includes('/plugins/demo/page') || !left.includes('/existing')) throw new Error(`${mode}: a legitimate route was removed`);
        }

        ConfigManager.set('pluginRouteGuard', 'off');
        const app = express();
        const before = PluginRouteGuard.snapshot(app);
        app.get('/login', (req, res) => res.end());
        if (PluginRouteGuard.check(app, before, 'test-plugin').length !== 0) throw new Error('The guard ran while off');
    } finally {
        ConfigManager.set('pluginRouteGuard', previous === null ? 'warn' : previous);
    }

    if (!RESERVED_PREFIXES.includes('/account')) throw new Error('/account is not reserved');
});

register('web.site-info', 'Site info only exposes http(s) version links', async () => {
    const ConfigManager = require('../../../manager/config-manager');
    const app = express();
    app.use(require('../../../../api/web/site'));
    const previous = { link: ConfigManager.get('gameVersionsUrl'), address: ConfigManager.get('serverAddress') };

    try {
        await withServer(app, async (base) => {
            const url = `${base}/neodyme/api/site`;

            ConfigManager.set('gameVersionsUrl', 'javascript:alert(1)');
            ConfigManager.set('serverAddress', '');
            let data = await (await fetch(url)).json();
            if (data.gameVersionsUrl !== '') throw new Error('A non-http link was exposed');
            if (!data.serverAddress) throw new Error('No server address was derived');

            ConfigManager.set('gameVersionsUrl', 'https://example.com/versions');
            ConfigManager.set('serverAddress', 'play.example.com:3551');
            data = await (await fetch(url)).json();
            if (data.gameVersionsUrl !== 'https://example.com/versions') throw new Error('The configured link was not returned');
            if (data.serverAddress !== 'play.example.com:3551') throw new Error('The configured address was not returned');
        });
    } finally {
        ConfigManager.set('gameVersionsUrl', previous.link === null ? '' : previous.link);
        ConfigManager.set('serverAddress', previous.address === null ? '' : previous.address);
    }
});

register('web.zip-export', 'The export zip is a valid archive', () => {
    const zlib = require('zlib');
    const { buildZip, crc32 } = require('../../../utils/zip-builder');
    const files = [{ name: 'a.json', data: '{"a":1}' }, { name: 'dir/b.json', data: 'x'.repeat(5000) }, { name: 'empty.txt', data: '' }];
    const zip = buildZip(files);

    const end = zip.length - 22;
    if (zip.readUInt32LE(end) !== 0x06054b50) throw new Error('No end of archive record');
    if (zip.readUInt16LE(end + 10) !== files.length) throw new Error('Wrong entry count');

    let offset = zip.readUInt32LE(end + 16);
    for (const file of files) {
        if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Bad directory entry for ${file.name}`);
        const crc = zip.readUInt32LE(offset + 16);
        const packed = zip.readUInt32LE(offset + 20);
        const nameLength = zip.readUInt16LE(offset + 28);
        const local = zip.readUInt32LE(offset + 42);
        const name = zip.toString('utf-8', offset + 46, offset + 46 + nameLength);
        if (name !== file.name) throw new Error(`Entry name ${name} should be ${file.name}`);

        const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        const content = zlib.inflateRawSync(zip.subarray(dataStart, dataStart + packed));
        if (content.toString('utf-8') !== file.data) throw new Error(`Content of ${file.name} was altered`);
        if (crc32(content) !== crc) throw new Error(`Checksum of ${file.name} is wrong`);
        offset += 46 + nameLength;
    }
});
