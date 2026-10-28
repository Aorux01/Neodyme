const express = require('express');
const fs = require('fs');
const path = require('path');

const PAGES = [
    'login', 'register', 'dashboard', 'shop', 'purchase', 'status', 'updates', 'admin',
    'forgot-password', 'reset-password', 'verify-email', 'security', 'appeal'
];
const ACCOUNT_PAGES = ['profile', 'friends', 'security', 'settings', 'support', 'creator-code'];
const RESERVED_PREFIXES = [
    ...PAGES, 'docs', 'account', 'html', 'css', 'js', 'images', 'favicon.ico'
].map(name => `/${name}`);
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

    router.get('/dashboard', (req, res) => res.redirect(302, redirectTo(req, '/account')));

    for (const name of PAGES.filter(page => page !== 'dashboard')) {
        router.get(`/${name}`, send(path.join(htmlDir, `${name}.html`)));
    }

    router.get('/account', send(path.join(htmlDir, 'dashboard.html')));
    router.get('/account/:section', (req, res, next) => {
        if (!ACCOUNT_PAGES.includes(req.params.section)) return next();
        send(path.join(htmlDir, 'dashboard.html'))(req, res, next);
    });

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

module.exports = { pageRoutes, PAGES, ACCOUNT_PAGES, RESERVED_PREFIXES };
