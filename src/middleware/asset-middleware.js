const path = require('path');
const AssetService = require('../service/api/asset-service');
const LoggerService = require('../service/logger/logger-service');

function assetMiddleware(typeSegment = 'images') {
    return (req, res, next) => {
        const subPath = decodeURIComponent(req.path).replace(/^\/+/, '');

        // Reject path traversal attempts.
        const normalizedSub = path.posix.normalize(subPath);
        if (normalizedSub.startsWith('..') || normalizedSub.includes('/../') || normalizedSub === '..') {
            return res.status(400).send('Invalid path');
        }

        const assetKey = `${typeSegment}/${normalizedSub}`;

        try {
            const result = AssetService.resolve(assetKey);

            switch (result.action) {
                case 'static':
                    return next();

                case 'redirect':
                    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
                    return res.redirect(302, result.target);

                case 'notfound':
                    return res.status(404).send(`Asset not found: ${assetKey}`);

                default:
                    return next();
            }
        } catch (error) {
            LoggerService.log('error', `Asset middleware error for ${assetKey}: ${error.message}`);
            return next();
        }
    };
}

module.exports = { assetMiddleware };
