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

router.patch("/api/locker/v4/:deploymentId/account/:accountId/companion-name",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const { cosmeticItemId, companionName } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (cosmeticItemId && companionName) {
                const itemGuid = cosmeticItemId.split(":")[2];

                if (!profile.items[itemGuid]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (!profile.items[itemGuid].attributes.variants) {
                    profile.items[itemGuid].attributes.variants = [];
                }

                profile.items[itemGuid].attributes.variants.push({
                    channel: "CustomName",
                    active: companionName,
                    owned: []
                });

                await DatabaseManager.updateItemInProfile(accountId, 'athena', itemGuid, {
                    'attributes.variants': profile.items[itemGuid].attributes.variants
                });

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            res.status(204).end();
        } catch (ero) {
            LoggerService.log('error', `Set companion name error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);


module.exports = router;