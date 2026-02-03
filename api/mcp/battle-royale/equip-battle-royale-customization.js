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

router.post("/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const queryRevision = req.query.rvn || -1;
            const { slotName, itemToSlot, indexWithinSlot, variantUpdates } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.stats.attributes.favorite_dance) {
                profile.stats.attributes.favorite_dance = ["","","","","",""];
            }
            if (!profile.stats.attributes.favorite_itemwraps) {
                profile.stats.attributes.favorite_itemwraps = ["","","","","","",""];
            }

            const changes = [];
            let variantChanged = false;

            try {
                const returnVariantsAsString = JSON.stringify(variantUpdates || []);

                if (returnVariantsAsString.includes("active") && itemToSlot && profile.items[itemToSlot]) {
                    if (!profile.items[itemToSlot].attributes.variants) {
                        profile.items[itemToSlot].attributes.variants = [];
                    }

                    if (profile.items[itemToSlot].attributes.variants.length === 0) {
                        profile.items[itemToSlot].attributes.variants = variantUpdates || [];
                    } else {
                        for (let i = 0; i < profile.items[itemToSlot].attributes.variants.length; i++) {
                            try {
                                if (variantUpdates[i] && profile.items[itemToSlot].attributes.variants[i].channel.toLowerCase() === variantUpdates[i].channel.toLowerCase()) {
                                    profile.items[itemToSlot].attributes.variants[i].active = variantUpdates[i].active || "";
                                }
                            } catch (err) {}
                        }
                    }

                    await DatabaseManager.updateItemInProfile(accountId, 'athena', itemToSlot, {
                        'attributes.variants': profile.items[itemToSlot].attributes.variants
                    });

                    variantChanged = true;
                }
            } catch (err) {}

            if (slotName) {
                let category = `favorite_${slotName.toLowerCase()}`;

                switch (slotName) {
                    case "Character":
                    case "Backpack":
                    case "Pickaxe":
                    case "Glider":
                    case "SkyDiveContrail":
                    case "MusicPack":
                    case "LoadingScreen":
                        profile.stats.attributes[category] = itemToSlot || "";
                        break;

                    case "Dance":
                        const danceIndex = indexWithinSlot || 0;
                        if (Math.sign(danceIndex) === 1 || Math.sign(danceIndex) === 0) {
                            profile.stats.attributes.favorite_dance[danceIndex] = itemToSlot || "";
                        }
                        break;

                    case "ItemWrap":
                        const wrapIndex = indexWithinSlot || 0;
                        const sign = Math.sign(wrapIndex);

                        if (sign === 0 || sign === 1) {
                            profile.stats.attributes.favorite_itemwraps[wrapIndex] = itemToSlot || "";
                        } else if (sign === -1) {
                            for (let i = 0; i < 7; i++) {
                                profile.stats.attributes.favorite_itemwraps[i] = itemToSlot || "";
                            }
                        }
                        break;
                }

                if (category === "favorite_itemwrap") {
                    category += "s";
                }

                await DatabaseManager.updateProfileStats(accountId, 'athena', {
                    [`attributes.${category}`]: profile.stats.attributes[category]
                });

                changes.push(MCPResponseBuilder.createStatChange(category, profile.stats.attributes[category]));

                if (variantChanged && itemToSlot) {
                    changes.push({
                        changeType: 'itemAttrChanged',
                        itemId: itemToSlot,
                        attributeName: 'variants',
                        attributeValue: profile.items[itemToSlot].attributes.variants
                    });
                }

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `EquipBattleRoyaleCustomization error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;