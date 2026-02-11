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

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetCosmeticLockerSlot",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { category, lockerItem, itemToSlot, variantUpdates, slotIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            try {
                const returnVariantsAsString = JSON.stringify(variantUpdates || []);

                if (returnVariantsAsString.includes("active")) {
                    const newVariants = [{ variants: [] }];

                    if (profileId === "athena") {
                        if (!profile.items[itemToSlot]) {
                            const err = Errors.MCP.itemNotFound();
                            return res.status(err.statusCode).json(err.toJSON());
                        }

                        if (!profile.items[itemToSlot].attributes.variants) {
                            profile.items[itemToSlot].attributes.variants = [];
                        }

                        for (const variantUpdate of variantUpdates) {
                            let found = false;
                            
                            for (const variant of profile.items[itemToSlot].attributes.variants) {
                                if (variantUpdate.channel === variant.channel) {
                                    variant.active = variantUpdate.active;
                                    found = true;
                                    break;
                                }
                            }

                            if (!found) {
                                profile.items[itemToSlot].attributes.variants.push(variantUpdate);
                            }
                        }

                        await DatabaseManager.updateItemInProfile(accountId, profileId, itemToSlot, {
                            'attributes.variants': profile.items[itemToSlot].attributes.variants
                        });

                        changes.push({
                            changeType: 'itemAttrChanged',
                            itemId: itemToSlot,
                            attributeName: 'variants',
                            attributeValue: profile.items[itemToSlot].attributes.variants
                        });
                    }

                    for (const variantUpdate of variantUpdates) {
                        newVariants[0].variants.push({
                            channel: variantUpdate.channel,
                            active: variantUpdate.active
                        });

                        if (profile.items[lockerItem]?.attributes?.locker_slots_data?.slots?.[category]) {
                            profile.items[lockerItem].attributes.locker_slots_data.slots[category].activeVariants = newVariants;
                        }
                    }
                }
            } catch (err) {}

            if (category && lockerItem) {
                if (!profile.items[lockerItem]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                switch (category) {
                    case "Character":
                    case "Backpack":
                    case "Pickaxe":
                    case "Glider":
                    case "SkyDiveContrail":
                    case "MusicPack":
                    case "LoadingScreen":
                        profile.items[lockerItem].attributes.locker_slots_data.slots[category].items = [itemToSlot || ""];
                        break;

                    case "Dance":
                        const danceIndex = slotIndex || 0;
                        if (Math.sign(danceIndex) === 1 || Math.sign(danceIndex) === 0) {
                            profile.items[lockerItem].attributes.locker_slots_data.slots.Dance.items[danceIndex] = itemToSlot || "";
                        }
                        break;

                    case "ItemWrap":
                        const wrapIndex = slotIndex || 0;
                        const sign = Math.sign(wrapIndex);

                        if (sign === 0 || sign === 1) {
                            profile.items[lockerItem].attributes.locker_slots_data.slots.ItemWrap.items[wrapIndex] = itemToSlot || "";
                        } else if (sign === -1) {
                            for (let i = 0; i < 7; i++) {
                                profile.items[lockerItem].attributes.locker_slots_data.slots.ItemWrap.items[i] = itemToSlot || "";
                            }
                        }
                        break;
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, lockerItem, {
                    'attributes.locker_slots_data': profile.items[lockerItem].attributes.locker_slots_data
                });

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: lockerItem,
                    attributeName: 'locker_slots_data',
                    attributeValue: profile.items[lockerItem].attributes.locker_slots_data
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
            LoggerService.log('error', `SetCosmeticLockerSlot error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;