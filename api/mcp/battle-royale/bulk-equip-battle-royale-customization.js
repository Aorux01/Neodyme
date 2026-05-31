const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

router.post("/fortnite/api/game/v2/profile/:accountId/client/BulkEquipBattleRoyaleCustomization",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const queryRevision = req.query.rvn || -1;
            const { itemsToSlot } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');

            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const baseRevision = profile.rvn || 0;

            if (!profile.stats.attributes.favorite_dance) {
                profile.stats.attributes.favorite_dance = ["", "", "", "", "", ""];
            }
            if (!profile.stats.attributes.favorite_itemwraps) {
                profile.stats.attributes.favorite_itemwraps = ["", "", "", "", "", "", ""];
            }

            const changes = [];
            let modified = false;

            if (Array.isArray(itemsToSlot)) {
                for (const slot of itemsToSlot) {
                    const { slotName, itemToSlot, indexWithinSlot, variantUpdates } = slot;

                    if (!slotName) continue;

                    // Apply variant updates
                    try {
                        const variantsStr = JSON.stringify(variantUpdates || []);
                        if (variantsStr.includes("active") && itemToSlot && profile.items[itemToSlot]) {
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
                                    } catch (e) {}
                                }
                            }
                            await DatabaseManager.updateItemInProfile(accountId, 'athena', itemToSlot, {
                                'attributes.variants': profile.items[itemToSlot].attributes.variants
                            });
                            changes.push({
                                changeType: 'itemAttrChanged',
                                itemId: itemToSlot,
                                attributeName: 'variants',
                                attributeValue: profile.items[itemToSlot].attributes.variants
                            });
                        }
                    } catch (e) {}

                    // Apply slot equip
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

                        case "Dance": {
                            const danceIndex = indexWithinSlot || 0;
                            if (Math.sign(danceIndex) === 1 || Math.sign(danceIndex) === 0) {
                                profile.stats.attributes.favorite_dance[danceIndex] = itemToSlot || "";
                            }
                            break;
                        }

                        case "ItemWrap": {
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
                    }

                    if (category === "favorite_itemwrap") category += "s";

                    await DatabaseManager.updateProfileStats(accountId, 'athena', {
                        [`attributes.${category}`]: profile.stats.attributes[category]
                    });

                    changes.push(MCPResponseBuilder.createStatChange(category, profile.stats.attributes[category]));
                    modified = true;
                }
            }

            if (modified) {
                profile.rvn += 1;
                profile.commandRevision += 1;
                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            if (changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes, baseRevision);
            }
        } catch (error) {
            const LoggerService = require('../../../src/service/logger/logger-service');
            LoggerService.log('error', `BulkEquipBattleRoyaleCustomization error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
