const express = require('express');
const fs = require('fs');
const path = require('path');

const PAGES = [
    'login', 'register', 'dashboard', 'shop', 'purchase', 'status', 'updates', 'admin',
    'forgot-password', 'reset-password', 'verify-email', 'security', 'appeal'
];
const DOC_NAME = /^[a-z0-9-]+$/;

function pageRoutes(webDir) {
    const router = express.Router();
    const htmlDir = path.join(webDir, 'html');
    const docsDir = path.join(htmlDir, 'docs');

    const send = (file) => (req, res, next) => {
        if (!fs.existsSync(file)) return next();
        res.sendFile(file);
    };

    const redirectTo = (req, target) => {
        const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
        return `${target}${query}`;
    };

    for (const name of PAGES) {
        router.get(`/${name}`, send(path.join(htmlDir, `${name}.html`)));
    }

    router.get('/docs', send(path.join(docsDir, 'index.html')));
    router.get('/docs/:page', (req, res, next) => {
        const { page } = req.params;
        if (!DOC_NAME.test(page) || page === 'index') return next();
        send(path.join(docsDir, `${page}.html`))(req, res, next);
    });

    router.get('/html/docs/:page.html', (req, res, next) => {
        const { page } = req.params;
        if (!DOC_NAME.test(page)) return next();
        res.redirect(301, redirectTo(req, page === 'index' ? '/docs' : `/docs/${page}`));
    });

    router.get('/html/:page.html', (req, res, next) => {
        if (!PAGES.includes(req.params.page)) return next();
        res.redirect(301, redirectTo(req, `/${req.params.page}`));
    });

    return router;
}

module.exports = { pageRoutes, PAGES };
