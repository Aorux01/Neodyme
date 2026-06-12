const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const LoggerService = require('../../src/service/logger/logger-service');
const AuditService = require('../../src/service/api/audit-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { requireDeveloper } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;
const dev      = [verifyToken, requireDeveloper];
const devWrite = [verifyToken, requireDeveloper, csrfProtection];

const PUBLIC_IMAGES_DIR  = path.join(__dirname, '..', '..', 'public', 'images');
const UPLOADED_DIR_REL   = 'uploaded-images';
const UPLOADED_DIR_ABS   = path.join(PUBLIC_IMAGES_DIR, UPLOADED_DIR_REL);
const ASSETS_INDEX_PATH  = path.join(__dirname, '..', '..', 'content', 'assets-index.json');
const PUBLIC_BASE_URL    = 'https://fortnite-public-service-prod11.ol.epicgames.com';
const MAX_UPLOAD_BYTES   = 5 * 1024 * 1024; // 5 MB

const writeFileAtomic = (filePath, data) => {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, data, 'utf8');
    fs.renameSync(tempPath, filePath);
};

// Magic-byte sniffing - we accept the file only if its actual bytes match an
// allowed image format, regardless of the extension the client claimed.
const MAGIC_SIGNATURES = [
    { ext: 'png',  test: (b) => b.length >= 8  && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
    { ext: 'jpg',  test: (b) => b.length >= 3  && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
    { ext: 'gif',  test: (b) => b.length >= 6  && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
    // WebP starts with "RIFF....WEBP"
    { ext: 'webp', test: (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

const sniffExtension = (buffer) => {
    for (const sig of MAGIC_SIGNATURES) if (sig.test(buffer)) return sig.ext;
    return null;
};

const ensureUploadDir = () => { if (!fs.existsSync(UPLOADED_DIR_ABS)) fs.mkdirSync(UPLOADED_DIR_ABS, { recursive: true }); };

const ensureAlwaysLocalRule = (index) => {
    if (!Array.isArray(index.alwaysLocal)) index.alwaysLocal = [];
    const rule = `images/${UPLOADED_DIR_REL}/**`;
    if (!index.alwaysLocal.includes(rule)) index.alwaysLocal.push(rule);
};

const loadIndex = () => {
    if (!fs.existsSync(ASSETS_INDEX_PATH)) return { version: 1, alwaysLocal: [], assets: {} };
    return JSON.parse(fs.readFileSync(ASSETS_INDEX_PATH, 'utf8'));
};

const saveIndex = (index) => {
    index._generatedAt = new Date().toISOString();
    writeFileAtomic(ASSETS_INDEX_PATH, JSON.stringify(index, null, 2));
    // Force AssetService to reload on next request - it watches mtime, so the
    // write above is enough. We don't need to call any explicit invalidate.
};

const publicUrlFor = (relPath) => `${PUBLIC_BASE_URL}/images/${relPath.replace(/^images\//, '').replace(/^\/+/, '')}`;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Browse - list every file actually present under public/images/, grouped by
// top-level folder. The asset index lists *managed* assets; this endpoint shows
// what is physically on disk (which is what staff actually pick from).
router.get('/neodyme/api/dev/assets/local', ...dev, async (req, res) => {
    try {
        if (!fs.existsSync(PUBLIC_IMAGES_DIR)) return WebResponse.ok(res, { folders: {} });

        const folders = {};
        const walk = (dirAbs, relPrefix) => {
            for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
                const childAbs = path.join(dirAbs, entry.name);
                const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) walk(childAbs, childRel);
                else if (entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name)) {
                    const folder = relPrefix || '(root)';
                    if (!folders[folder]) folders[folder] = [];
                    const stat = fs.statSync(childAbs);
                    folders[folder].push({
                        path: `images/${childRel}`,
                        url: publicUrlFor(`images/${childRel}`),
                        size: stat.size,
                        mtime: stat.mtimeMs,
                        ext: path.extname(entry.name).slice(1).toLowerCase()
                    });
                }
            }
        };
        walk(PUBLIC_IMAGES_DIR, '');

        for (const folder of Object.keys(folders)) folders[folder].sort((a, b) => b.mtime - a.mtime);
        return WebResponse.ok(res, { folders });
    } catch (error) {
        return WebResponse.serverError(res, 'list local assets', error);
    }
});

// Browse online - entries from assets-index.json that have a CDN URL and are
// not present on disk (i.e. served by redirect in "online" mode).
router.get('/neodyme/api/dev/assets/online', ...dev, async (req, res) => {
    try {
        const index = loadIndex();
        const entries = [];
        for (const [relPath, meta] of Object.entries(index.assets || {})) {
            if (!meta || !meta.cdn) continue;
            const onDisk = fs.existsSync(path.join(__dirname, '..', '..', 'public', relPath));
            if (onDisk) continue;
            entries.push({
                path: relPath,
                cdn: meta.cdn,
                size: meta.size || null,
                tags: meta.tags || [],
            });
        }
        entries.sort((a, b) => a.path.localeCompare(b.path));
        return WebResponse.ok(res, { entries });
    } catch (error) {
        return WebResponse.serverError(res, 'list online assets', error);
    }
});

// Upload a single image. We sniff magic bytes to make sure a .png is really a
// PNG (and not a renamed script), then write under public/images/uploaded-images/
// with a timestamped filename, and register it in assets-index.json.
router.post('/neodyme/api/dev/assets/upload', ...devWrite, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return WebResponse.badRequest(res, `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
            return WebResponse.badRequest(res, err.message || 'Upload failed.');
        }
        if (!req.file) return WebResponse.badRequest(res, 'No file uploaded.');

        try {
            const buf = req.file.buffer;
            const realExt = sniffExtension(buf);
            if (!realExt) return WebResponse.badRequest(res, 'File is not a recognized image (PNG, JPEG, WebP, GIF).');

            ensureUploadDir();
            const ts = Date.now();
            const rand = Math.random().toString(36).slice(2, 10);
            const filename = `${ts}-${rand}.${realExt === 'jpg' ? 'jpg' : realExt}`;
            const absPath  = path.join(UPLOADED_DIR_ABS, filename);
            const relPath  = `images/${UPLOADED_DIR_REL}/${filename}`;

            fs.writeFileSync(absPath, buf);

            const index = loadIndex();
            ensureAlwaysLocalRule(index);
            index.assets = index.assets || {};
            index.assets[relPath] = {
                size: buf.length,
                tags: ['uploaded'],
                originalName: req.file.originalname || filename,
                uploadedBy: req.user.displayName,
                uploadedAt: new Date().toISOString(),
            };
            saveIndex(index);

            const fileMeta = {
                filename,
                path: relPath,
                url:  publicUrlFor(relPath),
                size: buf.length,
                ext: realExt,
                originalName: req.file.originalname || filename,
            };
            await AuditService.logAssetUpload(req.user.accountId, req.user.displayName, fileMeta, req.ip);
            LoggerService.log('info', `Asset uploaded: ${relPath} (${buf.length} bytes) by ${req.user.displayName}`);

            return WebResponse.ok(res, { message: 'Uploaded.', file: fileMeta });
        } catch (error) {
            return WebResponse.serverError(res, 'asset upload', error);
        }
    });
});

// Delete an uploaded image. We only allow deletion under uploaded-images/ to
// avoid accidental wipes of /assets-installed content.
router.delete('/neodyme/api/dev/assets/uploaded/:filename', ...devWrite, async (req, res) => {
    try {
        const { filename } = req.params;
        if (!/^[\w.\-]+\.(png|jpe?g|webp|gif)$/i.test(filename)) {
            return WebResponse.badRequest(res, 'Invalid filename.');
        }

        const absPath = path.resolve(path.join(UPLOADED_DIR_ABS, filename));
        if (!absPath.startsWith(path.resolve(UPLOADED_DIR_ABS) + path.sep)) {
            return WebResponse.forbidden(res, 'Path escape detected.');
        }
        const relPath = `images/${UPLOADED_DIR_REL}/${filename}`;

        const fileExisted = fs.existsSync(absPath);
        const fileSize = fileExisted ? fs.statSync(absPath).size : null;
        if (fileExisted) fs.unlinkSync(absPath);

        const index = loadIndex();
        const indexMeta = index.assets && index.assets[relPath] || null;
        if (indexMeta) {
            delete index.assets[relPath];
            saveIndex(index);
        }

        await AuditService.logAssetDelete(req.user.accountId, req.user.displayName, relPath, req.ip, {
            filename,
            size: fileSize,
            indexEntry: indexMeta,
            fileExisted,
        });
        LoggerService.log('info', `Asset deleted: ${relPath} by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: 'Deleted.' });
    } catch (error) {
        return WebResponse.serverError(res, 'asset delete', error);
    }
});

module.exports = router;
