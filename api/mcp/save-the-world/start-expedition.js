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

router.post("/fortnite/api/game/v2/profile/:accountId/client/StartExpedition",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { expeditionId, squadId, itemIds, slotIndices } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const versionInfo = VersionService.getVersionInfo(req);

            
            
            const expeditionDataPath = path.join(__dirname, '../../../content/campaign/expedition-data.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const date = new Date().toISOString();

            if (expeditionId && squadId && itemIds && slotIndices) {
                const expeditionLevel = profile.items[expeditionId].attributes.expedition_max_target_power;
                let heroLevels = expeditionData.heroLevels;
                
                if (versionInfo.build < 13.20) {
                    heroLevels = heroLevels.old;
                } else {
                    heroLevels = heroLevels.new;
                }

                const sortedHeroes = [];
                for (let i = 0; i < itemIds.length; i++) {
                    const heroId = itemIds[i];
                    for (const item in profile.items) {
                        if (heroId === item) {
                            const splitTemplateId = profile.items[item].templateId.split("_");
                            const rarity = splitTemplateId.slice(-2, -1)[0].toLowerCase();
                            const tier = splitTemplateId.slice(-1)[0].toLowerCase();
                            const level = profile.items[item].attributes.level;
                            
                            const hero = {
                                itemGuid: heroId,
                                templateId: profile.items[item].templateId,
                                class: splitTemplateId[1].toLowerCase(),
                                rarity: rarity,
                                tier: tier,
                                level: level,
                                powerLevel: heroLevels[rarity][tier][level],
                                bBoostedByCriteria: false
                            };
                            sortedHeroes.push(hero);
                        }
                    }
                }
                sortedHeroes.sort((a, b) => b.powerLevel - a.powerLevel);

                if (profile.items[expeditionId].attributes.expedition_criteria) {
                    const criteria = profile.items[expeditionId].attributes.expedition_criteria;
                    for (let i = 0; i < criteria.length; i++) {
                        const criterion = criteria[i];

                        for (let x = 0; x < sortedHeroes.length; x++) {
                            let isMatchingHero = true;
                            const requirements = expeditionData.criteriaRequirements[criterion].requirements;
                            
                            if (requirements.class !== sortedHeroes[x].class) {
                                isMatchingHero = false;
                            }
                            if (requirements.rarity) {
                                if (!requirements.rarity.includes(sortedHeroes[x].rarity)) {
                                    isMatchingHero = false;
                                }
                            }

                            if (isMatchingHero && !sortedHeroes[x].bBoostedByCriteria) {
                                sortedHeroes[x].powerLevel = sortedHeroes[x].powerLevel * expeditionData.criteriaRequirements[criterion].ModValue;
                                sortedHeroes[x].bBoostedByCriteria = true;
                                break;
                            }
                        }
                    }
                }

                let totalPowerLevel = 0;
                for (let i = 0; i < sortedHeroes.length; i++) {
                    totalPowerLevel += sortedHeroes[i].powerLevel;
                }
                
                let expeditionSuccessChance = totalPowerLevel / expeditionLevel;
                if (expeditionSuccessChance > 1) {
                    expeditionSuccessChance = 1;
                }

                for (let i = 0; i < itemIds.length; i++) {
                    const heroId = itemIds[i];
                    profile.items[heroId].attributes.squad_id = squadId.toLowerCase();
                    profile.items[heroId].attributes.squad_slot_idx = slotIndices[i];

                    await DatabaseManager.updateItemInProfile(accountId, profileId, heroId, {
                        'attributes.squad_id': squadId.toLowerCase(),
                        'attributes.squad_slot_idx': slotIndices[i]
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: heroId,
                        attributeName: "squad_id",
                        attributeValue: squadId.toLowerCase()
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: heroId,
                        attributeName: "squad_slot_idx",
                        attributeValue: slotIndices[i]
                    });
                }

                const endDate = new Date(date);
                endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[profile.items[expeditionId].templateId].expedition_duration_minutes);
                const endDateISO = endDate.toISOString();

                profile.items[expeditionId].attributes.expedition_squad_id = squadId.toLowerCase();
                profile.items[expeditionId].attributes.expedition_success_chance = expeditionSuccessChance;
                profile.items[expeditionId].attributes.expedition_start_time = date;
                profile.items[expeditionId].attributes.expedition_end_time = endDateISO;

                await DatabaseManager.updateItemInProfile(accountId, profileId, expeditionId, {
                    'attributes.expedition_squad_id': squadId.toLowerCase(),
                    'attributes.expedition_success_chance': expeditionSuccessChance,
                    'attributes.expedition_start_time': date,
                    'attributes.expedition_end_time': endDateISO
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_squad_id",
                    attributeValue: squadId.toLowerCase()
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_success_chance",
                    attributeValue: expeditionSuccessChance
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_start_time",
                    attributeValue: date
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_end_time",
                    attributeValue: endDateISO
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
            LoggerService.log('error', `StartExpedition error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;