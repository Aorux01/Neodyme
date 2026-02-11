const Express = require("express");
const router = Express.Router();
const fs = require("fs");
const path = require("path");
const iniparser = require("ini");
const VersionService = require("../../src/service/api/version-service");
const ConfigManager = require("../../src/manager/config-manager");

// Helper functions for dynamic date calculations
function getShopState() {
    try {
        const shopStatePath = path.join(__dirname, '../../data/shop_state.json');
        if (fs.existsSync(shopStatePath)) {
            return JSON.parse(fs.readFileSync(shopStatePath, 'utf-8'));
        }
    } catch (error) {}
    return { categories: {} };
}

function getShopConfig() {
    try {
        const shopConfigPath = path.join(__dirname, '../../config/Shop.json');
        if (fs.existsSync(shopConfigPath)) {
            return JSON.parse(fs.readFileSync(shopConfigPath, 'utf-8'));
        }
    } catch (error) {}
    return { shopCategories: { daily: {}, featured: {} } };
}

function calculateSeasonDates() {
    const now = new Date();

    // seasonBegin = 1 month ago
    const seasonBegin = new Date(now);
    seasonBegin.setMonth(seasonBegin.getMonth() - 1);

    // seasonEnd = 3 months from now (and we add 2 months each month)
    const seasonEnd = new Date(now);
    seasonEnd.setMonth(seasonEnd.getMonth() + 3);

    // seasonDisplayedEnd = same as seasonEnd but slightly earlier for display
    const seasonDisplayedEnd = new Date(seasonEnd);
    seasonDisplayedEnd.setHours(seasonDisplayedEnd.getHours() - 6);

    return {
        seasonBegin: seasonBegin.toISOString(),
        seasonEnd: seasonEnd.toISOString(),
        seasonDisplayedEnd: seasonDisplayedEnd.toISOString()
    };
}

function calculateStoreDates() {
    const shopState = getShopState();
    const shopConfig = getShopConfig();
    const categories = shopConfig.shopCategories || {};

    const now = new Date();
    const sectionStoreEnds = {};
    let dailyStoreEnd = new Date(now);
    let weeklyStoreEnd = new Date(now);

    // Default: tomorrow at midnight for daily, next week for weekly
    dailyStoreEnd.setDate(dailyStoreEnd.getDate() + 1);
    dailyStoreEnd.setHours(0, 0, 0, 0);

    weeklyStoreEnd.setDate(weeklyStoreEnd.getDate() + 7);
    weeklyStoreEnd.setHours(0, 0, 0, 0);

    // Calculate end dates for each category from shop_state
    for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
        const categoryState = shopState.categories?.[categoryKey];
        const displayName = categoryConfig.displayName || categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);

        if (categoryState?.nextRotation) {
            sectionStoreEnds[displayName] = categoryState.nextRotation;

            // Update dailyStoreEnd and weeklyStoreEnd based on category type
            if (categoryConfig.rotationInterval === 'daily' || categoryKey.toLowerCase() === 'daily') {
                dailyStoreEnd = new Date(categoryState.nextRotation);
            }
            if (categoryConfig.rotationInterval === 'weekly' || categoryKey.toLowerCase() === 'featured') {
                weeklyStoreEnd = new Date(categoryState.nextRotation);
            }
        } else {
            // If no state, calculate based on rotation interval
            const rotationInterval = categoryConfig.rotationInterval || 'daily';
            const nextRotation = new Date(now);

            if (rotationInterval === 'daily') {
                nextRotation.setDate(nextRotation.getDate() + 1);
            } else if (rotationInterval === 'weekly') {
                nextRotation.setDate(nextRotation.getDate() + 7);
            } else if (rotationInterval === 'biweekly') {
                nextRotation.setDate(nextRotation.getDate() + 14);
            } else if (rotationInterval === 'monthly') {
                nextRotation.setMonth(nextRotation.getMonth() + 1);
            } else if (typeof rotationInterval === 'number') {
                nextRotation.setTime(nextRotation.getTime() + rotationInterval * 60 * 60 * 1000);
            }

            // Apply rotation time from config
            const rotationTime = shopConfig.shopRotationTime || '00:00';
            const [hour, minute] = rotationTime.split(':').map(Number);
            nextRotation.setHours(hour, minute, 0, 0);

            sectionStoreEnds[displayName] = nextRotation.toISOString();
        }
    }

    // Ensure at least Featured and Daily exist
    if (!sectionStoreEnds['Featured']) {
        sectionStoreEnds['Featured'] = weeklyStoreEnd.toISOString();
    }
    if (!sectionStoreEnds['Daily']) {
        sectionStoreEnds['Daily'] = dailyStoreEnd.toISOString();
    }

    return {
        sectionStoreEnds,
        dailyStoreEnd: dailyStoreEnd.toISOString(),
        weeklyStoreEnd: weeklyStoreEnd.toISOString()
    };
}

router.get("/fortnite/api/calendar/v1/timeline", async (req, res) => {
    const versionInfo = VersionService.getVersionInfo(req);

    // Calculate dynamic season dates
    const seasonDates1 = calculateSeasonDates();
    const dynamicSeasonEnd = seasonDates1.seasonEnd;
    const dynamicSeasonBegin = seasonDates1.seasonBegin;

    var activeEvents = [
    {
        "eventType": `EventFlag.Season${versionInfo.season}`,
        "activeUntil": dynamicSeasonEnd,
        "activeSince": dynamicSeasonBegin
    },
    {
        "eventType": `EventFlag.${versionInfo.lobby}`,
        "activeUntil": dynamicSeasonEnd,
        "activeSince": dynamicSeasonBegin
    }];

    switch (versionInfo.season) {
        case 3:
            activeEvents.push(
            {
                "eventType": "EventFlag.Spring2018Phase1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build >= 3.1) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Spring2018Phase2",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            if (versionInfo.build >= 3.3) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Spring2018Phase3",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            if (versionInfo.build >= 3.4) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Spring2018Phase4",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;
        
        case 4:
            activeEvents.push(
            {
                "eventType": "EventFlag.Blockbuster2018",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Blockbuster2018Phase1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build >= 4.3) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Blockbuster2018Phase2",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            if (versionInfo.build >= 4.4) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Blockbuster2018Phase3",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            if (versionInfo.build >= 4.5) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Blockbuster2018Phase4",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;
        
        case 5:
            activeEvents.push(
            {
                "eventType": "EventFlag.RoadTrip2018",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Horde",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Anniversary2018_BR",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_Heist",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build == 5.10) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.BirthdayBattleBus",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 6:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTM_Fortnitemares",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_LilKevin",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build >= 6.20) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Fortnitemares",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.FortnitemaresPhase1",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "POI0",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            if (versionInfo.build >= 6.22) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.FortnitemaresPhase2",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            if (versionInfo.build == 6.20 || versionInfo.build == 6.21) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.LobbySeason6Halloween",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.HalloweenBattleBus",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 7:
            activeEvents.push(
            {
                "eventType": "EventFlag.Frostnite",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_14DaysOfFortnite",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Festivus",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_WinterDeimos",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_S7_OverTime",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 8:
            activeEvents.push(
            {
                "eventType": "EventFlag.Spring2019",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Spring2019.Phase1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_Ashton",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_Goose",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_HighStakes",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_BootyBay",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build >= 8.2) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Spring2019.Phase2",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 9:
            activeEvents.push(
            {
                "eventType": "EventFlag.Season9.Phase1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Anniversary2019_BR",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_14DaysOfSummer",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_Mash",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_Wax",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build >= 9.2) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Season9.Phase2",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 10:
            activeEvents.push(
            {
                "eventType": "EventFlag.Mayday",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10.Phase2",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10.Phase3",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_BlackMonday",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S10_Oak",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S10_Mystery",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_2",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_3",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_4",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_5",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_6",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_7",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_8",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_9",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Season10_UrgentMission_10",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 11:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTE_CoinCollectXP",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin 
            },
            {
                "eventType": "EventFlag.LTE_Fortnitemares2019",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin 
            },
            {
                "eventType": "EventFlag.LTE_Galileo_Feats",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin 
            },
            {
                "eventType": "EventFlag.LTE_Galileo",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin 
            },
            {
                "eventType": "EventFlag.LTE_WinterFest2019",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
    
            if (versionInfo.build >= 11.2) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Starlight",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin 
                })
            }
    
            if (versionInfo.build < 11.3) {
                if (versionInfo.build >= 11.01) {
                    activeEvents.push(
                    {
                        "eventType": "EventFlag.Season11.Fortnitemares.Quests.Phase1",
                        "activeUntil": dynamicSeasonEnd,
                        "activeSince": dynamicSeasonBegin 
                    })
                }
                if (versionInfo.build >= 11.10) {
                    activeEvents.push(
                    {
                        "eventType": "EventFlag.Season11.Fortnitemares.Quests.Phase2",
                        "activeUntil": dynamicSeasonEnd,
                        "activeSince": dynamicSeasonBegin 
                    },
                    {
                        "eventType": "EventFlag.Season11.Fortnitemares.Quests.Phase3",
                        "activeUntil": dynamicSeasonEnd,
                        "activeSince": dynamicSeasonBegin 
                    },
                    {
                        "eventType": "EventFlag.Season11.Fortnitemares.Quests.Phase4",
                        "activeUntil": dynamicSeasonEnd,
                        "activeSince": dynamicSeasonBegin 
                    },
                    {
                        "eventType": "EventFlag.StormKing.Landmark",
                        "activeUntil": dynamicSeasonEnd,
                        "activeSince": dynamicSeasonBegin 
                    })
                }
            } else {
                activeEvents.push(
                {
                    "eventType": "EventFlag.HolidayDeco",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.Season11.WinterFest.Quests.Phase1",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.Season11.WinterFest.Quests.Phase2",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.Season11.WinterFest.Quests.Phase3",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.Season11.Frostnite",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
    
            if (versionInfo.build == 11.31 || versionInfo.build == 11.40) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Winterfest.Tree",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.LTE_WinterFest",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.LTE_WinterFest2019",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 12:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTE_SpyGames",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_JerkyChallenges",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Oro",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_StormTheAgency",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 14:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTE_Fortnitemares_2020",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 15:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_01",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_02",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_03",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_04",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_05",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_06",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_07",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_08",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_09",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_10",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_11",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_12",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_13",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_14",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S15_Legendary_Week_15",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_HiddenRole",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_OperationSnowdown",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_PlumRetro",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 16:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_01",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_02",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_03",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_04",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_05",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_06",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_07",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_08",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_09",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_10",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_11",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S16_Legendary_Week_12",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_NBA_Challenges",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_Spire_Challenges",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 17:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_TheMarch",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_O2_Challenges",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Buffet_PreQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Buffet_Attend",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Buffet_PostQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Buffet_Cosmetics",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_CosmicSummer",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_IslandGames",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_01",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_02",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_03",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_04",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_05",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_06",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_07",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_08",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_09",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_10",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_11",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_12",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_13",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Legendary_Week_14",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_CB_Radio",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Sneak_Week",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Yeet_Week",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Zap_Week",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S17_Bargain_Bin_Week",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 18:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTE_Season18_BirthdayQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_07",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_08",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_09",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_10",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_11",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_12",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_06",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_Fornitemares_2021",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_HordeRush",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_SoundWave",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Season18_TextileQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S18_WildWeek_Shadows",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S18_WildWeek_Bargain",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S18_Haste",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 19:
            activeEvents.push(
            {
                "eventType": "EventFlag.LTM_Hyena",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_Vigilante",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTM_ZebraWallet",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.LTE_Galileo_Feats",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S19_Trey",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S19_DeviceQuestsPart1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S19_DeviceQuestsPart2",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S19_DeviceQuestsPart3",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S19_Gow_Quests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_MonarchLevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S19_WinterfestCrewGrant",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_Chicken",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_BargainBin",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_Spider",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_Primal",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build == 19.01) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.LTE_WinterFest",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "WF_IG_AVAIL",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 20:
            activeEvents.push(
            {
                "eventType": "Event_S20_AliQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S20_EmicidaQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S20_WildWeeks_Bargain",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S20_WildWeeks_Chocolate",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S20_WildWeeks_Purple",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.CovertOps_Phase1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.CovertOps_Phase2",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.CovertOps_Phase3",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.CovertOps_Phase4",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S20_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S20_May4thQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.NoBuildQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S20_NoBuildQuests_TokenGrant",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 21:
            activeEvents.push(
            {
                "eventType": "Event_S21_FallFest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_IslandHopper",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_CRRocketQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_GenQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_Stamina",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S21_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_NoSweatSummer",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_WildWeeks_BargainBin",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_WildWeeks_Fire",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S21_WildWeeks_Kondor",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 22:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S22_BirthdayQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S22_DistantEcho",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S22_AyaQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S22_FNCSQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S22FortnitemaresQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S22_Headset",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S22HordeRush",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S22_VistaQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S22_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S22NarrativePart1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S22_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S22_WildWeek_Avian",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.S22_WildWeek_Bargain",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 23:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S23_Weekly_01",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_02",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_03",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_04",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_05",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_06",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_07",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_08",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_09",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_10",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_11",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_12",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23Cipher",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Emerald",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_FindIt",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_CreedQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_Lettuce",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart2",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart3",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart4",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart4BonusGoal",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart5",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_SunBurst",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S23_ZeroWeek",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            if (versionInfo.build == 23.10) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.LTE_WinterFest",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.LTE_WinterFestTab",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "WF_GUFF_AVAIL",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            break;

        case 24:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S24_SpringFling",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S24_TigerRoot",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S24_Epicenter",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S24_SunBurst",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S24_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S24_NarrativeQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S24_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 25:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S25_14DOS",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S25_AloeCrouton",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S25_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S25_Maze",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S25_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 26:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S26_BirthdayQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S26_FNM",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S26_Mash",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S26_Intertwine",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S26_LevelUpPack",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 27:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S27_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;
        
        case 28:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S28_LevelUpPass",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S28_Prelude",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S28_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S28_Winterfest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 29:
            activeEvents.push(
            {
                "eventType": "Event_S29_ColdDayPrelude",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S29_LevelUpPass",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S29_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S29_SeasonalActivation",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S29_WhiplashWW",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 30:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S30_FlatWare",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_GreenhousePrelude",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S30_LevelUpPass",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S30_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S30_StoryQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S30_StoryQuests_P6",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S30_AllSweat",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;

        case 31:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S31_Birthday",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_QuestDeckBed",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S31_FoundQuests_GreenTown",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S31_FoundQuests_PB_P01",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "Event_S31_FoundQuests_PB_P02",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_FoundQuests_TroutWrist",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_LevelUpPass",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_Mash",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_MobileQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_Sweatember",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S31_ToadJam",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;
        case 32:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S32_RebootRally",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S32_ScytheGold",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;
        case 33:
            if (versionInfo.build == 33.11) {
                activeEvents.push(
                {
                    "eventType": "EventFlag.Winterfest_S33_CabinRewards",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.S33_WinterFestTab",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "WF_GUFF_AVAIL",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                },
                {
                    "eventType": "EventFlag.S33_WinterFest",
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                })
            }
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S33_BlondeJaw",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S33_Scenario_BatterBoi",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_Scenario_Shell",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S33_NarrativeBattleQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S33_ChatQuest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;
        case 34:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S34_Bling",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_CollectionQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_Lanternfest",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_LTE_Quests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_SummerRoadtrip_Quests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_RoomCharge",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_SprocketPoppy",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_StoryQuests_EOS_01",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_StoryQuests_EOS_02",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_StoryQuests_P1",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_WeaponExpertise",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S34_WeaponExpertiseSniper",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
            break;
        case 35:
            activeEvents.push(
            {
                "eventType": "EventFlag.Event_S35_FoundQuests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S35_MidSeasonCharacter_Quests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            },
            {
                "eventType": "EventFlag.Event_S35_SummerRoadtrip_Quests",
                "activeUntil": dynamicSeasonEnd,
                "activeSince": dynamicSeasonBegin
            })
    }

    if (24.3 <= versionInfo.build && versionInfo.build <= 25) {
        activeEvents.push(
        {
            "eventType": "EventFlag.HordeV3",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week02",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week03",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week04",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week05",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week06",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week07",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        },
        {
            "eventType": "EventFlag.HordeV3.Week08",
            "activeUntil": dynamicSeasonEnd,
            "activeSince": dynamicSeasonBegin
        })
    }

    if (ConfigManager.get("bAllSTWEventsActivated") == true) {
        var Events = [
            "EventFlag.Blockbuster2018",
            "EventFlag.Blockbuster2018Phase1",
            "EventFlag.Blockbuster2018Phase2",
            "EventFlag.Blockbuster2018Phase3",
            "EventFlag.Blockbuster2018Phase4",
            "EventFlag.Fortnitemares",
            "EventFlag.FortnitemaresPhase1",
            "EventFlag.FortnitemaresPhase2",
            "EventFlag.Frostnite",
            "EventFlag.HolidayDeco",
            "EventFlag.Horde",
            "EventFlag.HordeV3",
            "EventFlag.Mayday",
            "EventFlag.Outpost",
            "EventFlag.Phoenix.Adventure",
            "EventFlag.Phoenix.Fortnitemares",
            "EventFlag.Phoenix.Fortnitemares.Clip",
            "EventFlag.Phoenix.NewBeginnings",
            "EventFlag.Phoenix.NewBeginnings.SpringTraining",
            "EventFlag.Phoenix.RoadTrip",
            "EventFlag.Phoenix.Winterfest",
            "EventFlag.Phoenix.Winterfest.GhostOfChristmas",
            "EventFlag.RoadTrip2018",
            "EventFlag.STWBrainstorm",
            "EventFlag.STWFennix",
            "EventFlag.STWIrwin",
            "EventFlag.Season10.Phase2",
            "EventFlag.Season10.Phase3",
            "EventFlag.Season11.Fortnitemares.Quests.Phase1",
            "EventFlag.Season11.Fortnitemares.Quests.Phase2",
            "EventFlag.Season11.Fortnitemares.Quests.Phase3",
            "EventFlag.Season11.Fortnitemares.Quests.Phase4",
            "EventFlag.Season11.Frostnite",
            "EventFlag.Season11.WinterFest.Quests.Phase1",
            "EventFlag.Season11.WinterFest.Quests.Phase2",
            "EventFlag.Season11.WinterFest.Quests.Phase3",
            "EventFlag.Season12.NoDancing.Quests",
            "EventFlag.Season12.Spies.Quests",
            "EventFlag.Season9.Phase1",
            "EventFlag.Season9.Phase2",
            "EventFlag.Spring2018Phase1",
            "EventFlag.Spring2018Phase2",
            "EventFlag.Spring2018Phase3",
            "EventFlag.Spring2018Phase4",
            "EventFlag.Spring2019",
            "EventFlag.Spring2019.Phase1",
            "EventFlag.Spring2019.Phase2",
            "EventFlag.Starlight",
            "EventFlag.StormKing.Landmark",
            "EventFlag.STWHuntMonster",
            "EventFlag.STWOutlandish",
            "EventFlag.YarrrTwo"
        ]

        const activeEventsSet = new Set(activeEvents.map(e => e.eventType));
        Events.forEach(Event => {
            if (!activeEventsSet.has(Event)) {
                activeEvents.push({
                    "eventType": Event,
                    "activeUntil": dynamicSeasonEnd,
                    "activeSince": dynamicSeasonBegin
                });
                activeEventsSet.add(Event);
            }
        });
    }

    // Calculate dynamic dates
    const seasonDates = calculateSeasonDates();
    const storeDates = calculateStoreDates();

    const stateTemplate = {
        "activeStorefronts": [],
        "eventNamedWeights": {},
        "seasonNumber": versionInfo.season,
        "seasonTemplateId": `AthenaSeason:athenaseason${versionInfo.season}`,
        "matchXpBonusPoints": 0,
        "seasonBegin": seasonDates.seasonBegin,
        "seasonEnd": seasonDates.seasonEnd,
        "seasonDisplayedEnd": seasonDates.seasonDisplayedEnd,
        "weeklyStoreEnd": storeDates.weeklyStoreEnd,
        "stwEventStoreEnd": storeDates.weeklyStoreEnd,
        "stwWeeklyStoreEnd": storeDates.weeklyStoreEnd,
        "sectionStoreEnds": storeDates.sectionStoreEnds,
        "dailyStoreEnd": storeDates.dailyStoreEnd
    };
    
    var states = [{
        validFrom: "2020-01-01T00:00:00.000Z",
        activeEvents: activeEvents.slice(),
        state: stateTemplate
    }]

    if (versionInfo.build == 4.5) {
        if (ConfigManager.get("bEnableGeodeEvent") == true) {
            states[0].activeEvents.push({
                "eventType": "EventFlag.BR_S4_Geode_Countdown",
                "activeUntil": ConfigManager.get("geodeEventStartDate")
            })
            
            states.push({
                validFrom: ConfigManager.get("geodeEventStartDate"),
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })

            var EventEndDate = new Date(new Date(ConfigManager.get("geodeEventStartDate")).getTime() + 3 * 60000).toISOString();

            states[1].activeEvents.push({
                "eventType": "EventFlag.BR_S4_Geode_Begin",
                "activeUntil": EventEndDate
            })

            activeEvents.push({
                "eventType": "EventFlag.BR_S4_Geode_Over",
                "activeUntil": dynamicSeasonEnd
            })

            if (ConfigManager.get("bEnableCrackInTheSky") == true) {
                activeEvents.push({
                    "eventType": "EventFlag.BR_S4_Rift_Growth",
                    "activeUntil": new Date(new Date(EventEndDate).getTime() + 13.6 * 24 * 60 * 60 * 1000).toISOString()
                })
            }

            states.push({
                validFrom: EventEndDate,
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })
        }

        if (ConfigManager.get("bEnableS4OddityPrecursor") == true) {
            for (var i = 1; i <= 8; i++) {
                var StartDate = new Date(new Date(ConfigManager.get("S4OddityEventStartDate")).getTime() + ConfigManager.get("S4OddityEventsInterval") * (i-1) * 60000).toISOString();
                activeEvents.push({
                    "eventType": `EventFlag.BR_S4_Oddity_0${i}_Tell`,
                    "activeUntil": StartDate
                })
            }
            states[states.length - 1].activeEvents = activeEvents.slice();
        }
        if (ConfigManager.get("bEnableS4OddityExecution") == true) {
            for (var i = 1; i <= 8; i++) {
                var StartDate = new Date(new Date(ConfigManager.get("S4OddityEventStartDate")).getTime() + ConfigManager.get("S4OddityEventsInterval") * (i-1) * 60000).toISOString();

                activeEvents.push({
                    "eventType": `EventFlag.BR_S4_Oddity_0${i}_Event`,
                    "activeUntil": dynamicSeasonEnd
                })

                var index = activeEvents.findIndex(item => item.eventType === `EventFlag.BR_S4_Oddity_0${i}_Tell`);
                if (index !== -1) {
                    activeEvents.splice(index, 1);
                }

                states.push({
                    validFrom: StartDate,
                    activeEvents: activeEvents.slice(),
                    state: stateTemplate
                })
            }
        }
    }

    if (versionInfo.build == 5.21) {
        if (ConfigManager.get("bEnableS5OddityPrecursor") == true) {
            states.push({
                validFrom: ConfigManager.get("S5OddityPrecursorDate"),
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })
            
            states[1].activeEvents.push(
            {
                "eventType": "EventFlag.BR_S5_Oddity_Tomato_Tell",
                "activeUntil": dynamicSeasonEnd
            })
        }
        if (ConfigManager.get("bEnableS5OddityExecution") == true) {
            states.push({
                validFrom: ConfigManager.get("S5OddityExecutionDate"),
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })
            
            states[states.length - 1].activeEvents.push(
            {
                "eventType": "EventFlag.BR_S5_Oddity_Tomato_Event",
                "activeUntil": dynamicSeasonEnd
            })
        }
    }

    if (versionInfo.build == 5.30) {
        if (ConfigManager.get("bEnableBlockbusterRiskyEvent") == true) {
            activeEvents.push({
                "eventType": "EventFlag.BR_S5_RiskyReels_Event",
                "activeUntil": dynamicSeasonEnd
            })
            states[0].activeEvents = activeEvents.slice();
        }
        
        if (ConfigManager.get("bEnableCubeLightning") == true) {
            states[0].activeEvents.push(
            {
                "eventType": "EventFlag.BR_S5_Rift_Corrupt",
                "activeUntil": ConfigManager.get("cubeSpawnDate")
            },
            {
                "eventType": "EventFlag.BR_S5_Cube_Lightning",
                "activeUntil": ConfigManager.get("cubeSpawnDate")
            })

            activeEvents.push({
                "eventType": "EventFlag.BR_S5_Cube_TurnOn",
                "activeUntil": dynamicSeasonEnd
            })

            states.push({
                validFrom: ConfigManager.get("cubeSpawnDate"),
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })
        }
    }

    if (versionInfo.build == 5.41) {
        if (ConfigManager.get("bEnableCubeLake") == true) {
            states[0].activeEvents.push(
            {
                "eventType": "EventFlag.BR_S5_Cube_StartMove",
                "activeUntil": ConfigManager.get("cubeLakeDate")
            },
            {
                "eventType": "EventFlag.BR_S5_Cube_TurnOn",
                "activeUntil": ConfigManager.get("cubeLakeDate")
            })
            
            states.push({
                validFrom: ConfigManager.get("cubeLakeDate"),
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })

            states[1].activeEvents.push(
            {
                "eventType": "EventFlag.BR_S5_Cube_StartMove",
                "activeUntil": ConfigManager.get("cubeLakeDate")
            },
            {
                "eventType": "EventFlag.BR_S5_Cube_TurnOn",
                "activeUntil": ConfigManager.get("cubeLakeDate")
            },       
            {
                "eventType": "EventFlag.BR_S5_Cube_MoveTo8",
                "activeUntil": ConfigManager.get("cubeLakeDate")
            })

            var EventEndDate = new Date(new Date(ConfigManager.get("cubeLakeDate")).getTime() + 1.5 * 60000).toISOString();

            states.push({
                validFrom: EventEndDate,
                activeEvents: activeEvents.slice(),
                state: stateTemplate
            })

            states[2].activeEvents.push({
                "eventType": "EventFlag.BR_S5_Cube_Destination",
                "activeUntil": dynamicSeasonEnd
            })
        }
    }

    res.json({
        "channels": {
            "client-matchmaking": {
                "states": [],
                "cacheExpire": dynamicSeasonEnd
            },
            "client-events": {
                "states": states,
                "cacheExpire": dynamicSeasonEnd
            }
        },
        "eventsTimeOffsetHrs": 0,
        "cacheIntervalMins": 10,
        "currentTime": new Date().toISOString()
    });
    res.end();
})

module.exports = router;
