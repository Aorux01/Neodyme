const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const VersionService = require('../../../src/service/api/version-service');
const LoggerService = require('../../../src/service/logger/logger-service');
const FunctionsService = require('../../../src/service/api/functions-service');
const ConfigManager = require('../../../src/manager/config-manager');
const ShopService = require("../../../src/service/api/shop-service");
const EXPService = require('../../../src/service/api/experience-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');
const fs = require('fs').promises;
const path = require('path');

router.use(MCPMiddleware.validateProfileId);

router.post("/api/locker/v4/:deploymentId/account/:accountId/lock-in-immutable-item/:cosmeticItemId",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const itemGuid = req.params.cosmeticItemId.split(":")[2];

            if (!itemGuid) {
                const err = Errors.MCP.invalidPayload();
                return res.status(err.statusCode).json(err.toJSON());
            }

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.items[itemGuid]) {
                const err = Errors.MCP.itemNotFound();
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.items[itemGuid].attributes.variants) {
                profile.items[itemGuid].attributes.variants = [];
            }

            for (const [key, value] of Object.entries(req.body.variants)) {
                profile.items[itemGuid].attributes.variants.push({
                    channel: key,
                    active: value.variantTag,
                    owned: []
                });
            }

            profile.items[itemGuid].attributes.locked_in = true;

            await DatabaseManager.updateItemInProfile(accountId, 'athena', itemGuid, {
                'attributes.variants': profile.items[itemGuid].attributes.variants,
                'attributes.locked_in': true
            });

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, 'athena', profile);

            res.status(204).end();
        } catch (error) {
            LoggerService.log('error', `Lock in immutable item error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;