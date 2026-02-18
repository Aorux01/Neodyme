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

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignHeroToLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { loadoutId, slotName, heroId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (loadoutId && slotName) {
                if (!profile.items[loadoutId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                const crewMembers = profile.items[loadoutId].attributes.crew_members;
                const heroIdLower = (heroId || "").toLowerCase();

                const clearHeroFromOtherSlots = (targetSlot) => {
                    const slots = ['commanderslot', 'followerslot1', 'followerslot2', 'followerslot3', 'followerslot4', 'followerslot5'];
                    for (const slot of slots) {
                        if (slot !== targetSlot && crewMembers[slot].toLowerCase() === heroIdLower) {
                            crewMembers[slot] = "";
                        }
                    }
                };

                switch (slotName) {
                    case "CommanderSlot":
                        clearHeroFromOtherSlots('commanderslot');
                        crewMembers.commanderslot = heroId || "";
                        break;
                    case "FollowerSlot1":
                        clearHeroFromOtherSlots('followerslot1');
                        crewMembers.followerslot1 = heroId || "";
                        break;
                    case "FollowerSlot2":
                        clearHeroFromOtherSlots('followerslot2');
                        crewMembers.followerslot2 = heroId || "";
                        break;
                    case "FollowerSlot3":
                        clearHeroFromOtherSlots('followerslot3');
                        crewMembers.followerslot3 = heroId || "";
                        break;
                    case "FollowerSlot4":
                        clearHeroFromOtherSlots('followerslot4');
                        crewMembers.followerslot4 = heroId || "";
                        break;
                    case "FollowerSlot5":
                        clearHeroFromOtherSlots('followerslot5');
                        crewMembers.followerslot5 = heroId || "";
                        break;
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutId, {
                    'attributes.crew_members': crewMembers
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "crew_members",
                    attributeValue: crewMembers
                });

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
            LoggerService.log('error', `AssignHeroToLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;