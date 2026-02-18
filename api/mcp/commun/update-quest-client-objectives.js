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

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpdateQuestClientObjectives",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { advance } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (advance) {
                for (const advanceItem of advance) {
                    const questsToUpdate = [];

                    for (const key in profile.items) {
                        if (profile.items[key].templateId.toLowerCase().startsWith("quest:")) {
                            for (const attr in profile.items[key].attributes) {
                                if (attr.toLowerCase() === `completion_${advanceItem.statName}`) {
                                    questsToUpdate.push(key);
                                }
                            }
                        }
                    }

                    for (const questId of questsToUpdate) {
                        let isIncomplete = false;

                        profile.items[questId].attributes[`completion_${advanceItem.statName}`] = advanceItem.count;

                        await DatabaseManager.updateItemInProfile(accountId, profileId, questId, {
                            [`attributes.completion_${advanceItem.statName}`]: advanceItem.count
                        });

                        changes.push({
                            changeType: "itemAttrChanged",
                            itemId: questId,
                            attributeName: `completion_${advanceItem.statName}`,
                            attributeValue: advanceItem.count
                        });

                        if (profile.items[questId].attributes.quest_state.toLowerCase() !== "claimed") {
                            for (const attr in profile.items[questId].attributes) {
                                if (attr.toLowerCase().startsWith("completion_")) {
                                    if (profile.items[questId].attributes[attr] === 0) {
                                        isIncomplete = true;
                                    }
                                }
                            }

                            if (!isIncomplete) {
                                profile.items[questId].attributes.quest_state = "Claimed";

                                await DatabaseManager.updateItemInProfile(accountId, profileId, questId, {
                                    'attributes.quest_state': "Claimed"
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: questId,
                                    attributeName: "quest_state",
                                    attributeValue: "Claimed"
                                });
                            }
                        }
                    }
                }

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
            LoggerService.log('error', `UpdateQuestClientObjectives error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;