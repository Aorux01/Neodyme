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

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetAffiliateName",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = 'common_core';
            const queryRevision = req.query.rvn || -1;
            const { affiliateName } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);

            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            let isValidCode = false;

            if (affiliateName === "") {
                isValidCode = false;
            } else {
                const creatorCode = await DatabaseManager.getCreatorCode(affiliateName);
                if (creatorCode && creatorCode.isActive) {
                    isValidCode = true;
                }
            }

            if (isValidCode) {
                profile.stats.attributes.mtx_affiliate_set_time = new Date().toISOString();
                profile.stats.attributes.mtx_affiliate = affiliateName;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.mtx_affiliate_set_time': profile.stats.attributes.mtx_affiliate_set_time,
                    'attributes.mtx_affiliate': affiliateName
                });

                changes.push(MCPResponseBuilder.createStatChange('mtx_affiliate_set_time', profile.stats.attributes.mtx_affiliate_set_time));
                changes.push(MCPResponseBuilder.createStatChange('mtx_affiliate', profile.stats.attributes.mtx_affiliate));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `SetAffiliateName error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;