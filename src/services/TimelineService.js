const fs = require('fs').promises;
const path = require('path');

class TimelineService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            const iniparser = require('ini');
            const configPath = path.join(process.cwd(), 'server.properties');
            const configData = require('fs').readFileSync(configPath, 'utf8');
            return iniparser.parse(configData);
        } catch (error) {
            return {
                Events: {
                    bEnableAllEvents: true,
                    bEnableGeodeEvent: false,
                    bEnableCrackInTheSky: false,
                    bEnableS4OddityPrecursor: false,
                    bEnableS4OddityExecution: false,
                    bEnableS5OddityPrecursor: false,
                    bEnableS5OddityExecution: false,
                    bEnableBlockbusterRiskyEvent: false,
                    bEnableCubeLightning: false,
                    bEnableCubeLake: false
                },
                Profile: {
                    bAllSTWEventsActivated: false
                }
            };
        }
    }

    getActiveEvents(versionInfo) {
        const activeEvents = [
            {
                "eventType": `EventFlag.Season${versionInfo.season}`,
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": `EventFlag.${versionInfo.lobby}`,
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        ];

        // Add season-specific events
        this.addSeasonEvents(activeEvents, versionInfo);

        // Add STW events if enabled
        if (this.config.Profile?.bAllSTWEventsActivated) {
            this.addSTWEvents(activeEvents);
        }

        return activeEvents;
    }

    addSeasonEvents(activeEvents, versionInfo) {
        const season = versionInfo.season;
        const build = versionInfo.build;

        switch (season) {
            case 3:
                this.addSeason3Events(activeEvents, build);
                break;
            case 4:
                this.addSeason4Events(activeEvents, build);
                break;
            case 5:
                this.addSeason5Events(activeEvents, build);
                break;
            case 6:
                this.addSeason6Events(activeEvents, build);
                break;
            case 7:
                this.addSeason7Events(activeEvents, build);
                break;
            case 8:
                this.addSeason8Events(activeEvents, build);
                break;
            case 9:
                this.addSeason9Events(activeEvents, build);
                break;
            case 10:
                this.addSeason10Events(activeEvents, build);
                break;
            case 12:
                this.addSeason12Events(activeEvents, build);
                break;
            case 11:
                this.addSeason11Events(activeEvents, build);
                break;
            case 13:
                break;
            case 14:
                this.addSeason14Events(activeEvents, build);
                break;
            case 15:
                this.addSeason15Events(activeEvents, build);
                break;
            case 16:
                this.addSeason16Events(activeEvents, build);
                break;
            case 17:
                this.addSeason17Events(activeEvents, build);
                break;
            case 18:
                this.addSeason18Events(activeEvents, build);
                break;
            case 19:
                this.addSeason19Events(activeEvents, build);
                break;
            case 20:
                this.addSeason20Events(activeEvents, build);
                break;
            case 21:
                this.addSeason21Events(activeEvents, build);
                break;
            case 22:
                this.addSeason22Events(activeEvents, build);
                break;
            case 23:
                this.addSeason23Events(activeEvents, build);
                break;
            case 24:
                this.addSeason24Events(activeEvents, build);
                break;
            case 25:
                this.addSeason25Events(activeEvents, build);
                break;
            case 26:
                this.addSeason26Events(activeEvents, build);
                break;
            case 27:
                this.addSeason27Events(activeEvents, build);
                break;
            case 28:
                this.addSeason28Events(activeEvents, build);
                break;
            case 29:
                this.addSeason29Events(activeEvents, build);
                break;
            case 30:
                this.addSeason30Events(activeEvents, build);
                break;
            case 31:
                this.addSeason31Events(activeEvents, build);
                break;
            case 32:
                this.addSeason32Events(activeEvents, build);
                break;
            default:
                if (season >= 15) {
                    this.addModernSeasonEvents(activeEvents, season, build);
                }
        }
    }

    addSeason3Events(activeEvents, build) {
        activeEvents.push({
            "eventType": "EventFlag.Spring2018Phase1",
            "activeUntil": "9999-01-01T00:00:00.000Z",
            "activeSince": "2020-01-01T00:00:00.000Z"
        });

        if (build >= 3.1) {
            activeEvents.push({
                "eventType": "EventFlag.Spring2018Phase2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        if (build >= 3.3) {
            activeEvents.push({
                "eventType": "EventFlag.Spring2018Phase3",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        if (build >= 3.4) {
            activeEvents.push({
                "eventType": "EventFlag.Spring2018Phase4",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason4Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Blockbuster2018",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Blockbuster2018Phase1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build >= 4.3) {
            activeEvents.push({
                "eventType": "EventFlag.Blockbuster2018Phase2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        if (build >= 4.4) {
            activeEvents.push({
                "eventType": "EventFlag.Blockbuster2018Phase3",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        if (build >= 4.5) {
            activeEvents.push({
                "eventType": "EventFlag.Blockbuster2018Phase4",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason5Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.RoadTrip2018",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Horde",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build == 5.10) {
            activeEvents.push(
                {
                    "eventType": "EventFlag.Anniversary2018_BR",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "EventFlag.BirthdayBattleBus",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                }
            );
        }

        if (build >= 5.20) {
            activeEvents.push({
                "eventType": "EventFlag.LTM_Heist",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason6Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.LTM_Fortnitemares",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_LilKevin",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build >= 6.20) {
            activeEvents.push(
                {
                    "eventType": "EventFlag.Fortnitemares",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "EventFlag.FortnitemaresPhase1",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                }
            );

            if (build == 6.20 || build == 6.21) {
                activeEvents.push(
                    {
                        "eventType": "EventFlag.LobbySeason6Halloween",
                        "activeUntil": "9999-01-01T00:00:00.000Z",
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    },
                    {
                        "eventType": "EventFlag.HalloweenBattleBus",
                        "activeUntil": "9999-01-01T00:00:00.000Z",
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    }
                );
            }
        }

        if (build >= 6.22) {
            activeEvents.push({
                "eventType": "EventFlag.FortnitemaresPhase2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason7Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Frostnite",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_14DaysOfFortnite",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Festivus",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_WinterDeimos",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_S7_OverTime",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason8Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Spring2019",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Spring2019.Phase1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_Ashton",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_Goose",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_HighStakes",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_BootyBay",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build >= 8.2) {
            activeEvents.push({
                "eventType": "EventFlag.Spring2019.Phase2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason9Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Season9.Phase1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Anniversary2019_BR",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_14DaysOfSummer",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_Mash",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_Wax",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build >= 9.2) {
            activeEvents.push({
                "eventType": "EventFlag.Season9.Phase2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason10Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Mayday",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Season10.Phase2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Season10.Phase3",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_BlackMonday",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S10_Oak",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S10_Mystery",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        // Add urgent missions
        for (let i = 1; i <= 10; i++) {
            activeEvents.push({
                "eventType": `EventFlag.Season10_UrgentMission_${i}`,
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }
    }

    addSeason11Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.LTE_CoinCollectXP",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Fortnitemares2019",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Galileo_Feats",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Galileo",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build >= 11.2) {
            activeEvents.push({
                "eventType": "EventFlag.Starlight",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        if (build >= 11.3) {
            activeEvents.push(
                {
                    "eventType": "EventFlag.LTE_WinterFest2019",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "EventFlag.HolidayDeco",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                }
            );

            if (build == 11.31 || build == 11.40) {
                activeEvents.push(
                    {
                        "eventType": "EventFlag.Winterfest.Tree",
                        "activeUntil": "9999-01-01T00:00:00.000Z",
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    },
                    {
                        "eventType": "EventFlag.LTE_WinterFest",
                        "activeUntil": "9999-01-01T00:00:00.000Z",
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    }
                );
            }
        }
    }

    addSeason12Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.LTE_SpyGames",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_JerkyChallenges",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Oro",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_StormTheAgency",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason14Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.LTE_Fortnitemares_2020",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason15Events(activeEvents, build) {
        // Add legendary weeks
        for (let i = 1; i <= 15; i++) {
            activeEvents.push({
                "eventType": `EventFlag.LTQ_S15_Legendary_Week_${i.toString().padStart(2, '0')}`,
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        activeEvents.push(
            {
                "eventType": "EventFlag.Event_HiddenRole",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_OperationSnowdown",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_PlumRetro",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason16Events(activeEvents, build) {
        // Add legendary weeks
        for (let i = 1; i <= 12; i++) {
            activeEvents.push({
                "eventType": `EventFlag.LTQ_S16_Legendary_Week_${i.toString().padStart(2, '0')}`,
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        activeEvents.push(
            {
                "eventType": "EventFlag.Event_NBA_Challenges",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_Spire_Challenges",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason17Events(activeEvents, build) {
        // Add legendary weeks
        for (let i = 1; i <= 14; i++) {
            activeEvents.push({
                "eventType": `EventFlag.LTQ_S17_Legendary_Week_${i.toString().padStart(2, '0')}`,
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
        }

        activeEvents.push(
            {
                "eventType": "EventFlag.Event_TheMarch",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_O2_Challenges",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Buffet_PreQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Buffet_Attend",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Buffet_PostQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Buffet_Cosmetics",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_CosmicSummer",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_IslandGames",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S17_CB_Radio",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S17_Sneak_Week",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S17_Yeet_Week",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S17_Zap_Week",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S17_Bargain_Bin_Week",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason18Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.LTE_Season18_BirthdayQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_07",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_08",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_09",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_10",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_11",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_12",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTQ_S18_Repeatable_Weekly_06",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_Fornitemares_2021",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_HordeRush",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_SoundWave",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Season18_TextileQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S18_WildWeek_Shadows",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S18_WildWeek_Bargain",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S18_Haste",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason19Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.LTM_Hyena",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_Vigilante",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTM_ZebraWallet",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.LTE_Galileo_Feats",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S19_Trey",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S19_DeviceQuestsPart1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S19_DeviceQuestsPart2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S19_DeviceQuestsPart3",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S19_Gow_Quests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_MonarchLevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S19_WinterfestCrewGrant",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_Chicken",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_BargainBin",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_Spider",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S19_WildWeeks_Primal",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );

        if (build == 19.01) {
            activeEvents.push(
                {
                    "eventType": "EventFlag.LTE_WinterFest",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "WF_IG_AVAIL",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                }
            );
        }
    }

    addSeason20Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "Event_S20_AliQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S20_EmicidaQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S20_WildWeeks_Bargain",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S20_WildWeeks_Chocolate",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S20_WildWeeks_Purple",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.CovertOps_Phase1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.CovertOps_Phase2", 
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.CovertOps_Phase3",
                "activeUntil": "9999-01-01T00:00:00.000Z", 
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.CovertOps_Phase4",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S20_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S20_May4thQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.NoBuildQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S20_NoBuildQuests_TokenGrant",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason21Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "Event_S21_FallFest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_IslandHopper",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_CRRocketQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_GenQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_Stamina",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S21_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_NoSweatSummer",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_WildWeeks_BargainBin",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_WildWeeks_Fire",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S21_WildWeeks_Kondor",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason22Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S22_BirthdayQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S22_DistantEcho",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S22_AyaQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S22_FNCSQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S22FortnitemaresQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S22_Headset",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S22HordeRush",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S22_VistaQuest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S22_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S22NarrativePart1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S22_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S22_WildWeek_Avian",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.S22_WildWeek_Bargain",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason23Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S23_Weekly_01",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_02",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_03",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_04",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_05",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_06",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_07",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_08",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_09",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_10",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_11",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Weekly_12",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23Cipher",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Emerald",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_FindIt",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_CreedQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_Lettuce",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart1",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart2",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart3",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart4",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart4BonusGoal",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23NarrativePart5",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_SunBurst",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S23_ZeroWeek",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    
        if (build === 23.10) {
            activeEvents.push(
                {
                    "eventType": "EventFlag.LTE_WinterFest",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "EventFlag.LTE_WinterFestTab",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "WF_GUFF_AVAIL",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                }
            );
        }
    }
    
    addSeason24Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S24_SpringFling",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S24_TigerRoot",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S24_Epicenter",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S24_SunBurst",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S24_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S24_NarrativeQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S24_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason25Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S25_14DOS",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S25_AloeCrouton",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S25_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S25_Maze",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S25_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason26Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S26_BirthdayQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S26_FNM",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S26_Mash",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S26_Intertwine",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S26_LevelUpPack",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason27Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S27_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason28Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S28_LevelUpPass",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S28_Prelude",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S28_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S28_Winterfest",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason29Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "Event_S29_ColdDayPrelude",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S29_LevelUpPass",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S29_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S29_SeasonalActivation",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S29_WhiplashWW",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason30Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S30_FlatWare",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_GreenhousePrelude",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S30_LevelUpPass",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S30_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S30_StoryQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S30_StoryQuests_P6",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S30_AllSweat",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }
    
    addSeason31Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S31_Birthday",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_QuestDeckBed",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S31_FoundQuests_GreenTown",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S31_FoundQuests_PB_P01",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "Event_S31_FoundQuests_PB_P02",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_FoundQuests_TroutWrist",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_LevelUpPass",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_Mash",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_MobileQuests",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_Sweatember",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S31_ToadJam",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addSeason32Events(activeEvents, build) {
        activeEvents.push(
            {
                "eventType": "EventFlag.Event_S32_RebootRally",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            },
            {
                "eventType": "EventFlag.Event_S32_ScytheGold",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": "2020-01-01T00:00:00.000Z"
            }
        );
    }

    addModernSeasonEvents(activeEvents, season, build) {
        // Add generic legendary quest weeks for seasons 15+
        if (season >= 15 && season <= 17) {
            const weekCount = season === 15 ? 15 : season === 16 ? 12 : 14;
            for (let week = 1; week <= weekCount; week++) {
                activeEvents.push({
                    "eventType": `EventFlag.LTQ_S${season}_Legendary_Week_${week.toString().padStart(2, '0')}`,
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                });
            }
        }

        // Special winterfest events
        if ((season === 19 && build === 19.01) || 
            (season === 23 && build === 23.10) || 
            (season === 33 && build === 33.11)) {
            activeEvents.push(
                {
                    "eventType": "EventFlag.LTE_WinterFest",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                },
                {
                    "eventType": "WF_GUFF_AVAIL",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                }
            );
        }
    }

    addSTWEvents(activeEvents) {
        const stwEvents = [
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
        ];

        const existingEventTypes = new Set(activeEvents.map(e => e.eventType));
        
        stwEvents.forEach(eventType => {
            if (!existingEventTypes.has(eventType)) {
                activeEvents.push({
                    "eventType": eventType,
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                });
            }
        });
    }

    generateTimeline(versionInfo) {
        const activeEvents = this.getActiveEvents(versionInfo);
        
        const states = [{
            validFrom: "2020-01-01T00:00:00.000Z",
            activeEvents: activeEvents,
            state: {
                activeStorefronts: [],
                eventNamedWeights: {},
                seasonNumber: versionInfo.season,
                seasonTemplateId: `AthenaSeason:athenaseason${versionInfo.season}`,
                matchXpBonusPoints: 0,
                seasonBegin: "2020-01-01T13:00:00Z",
                seasonEnd: "9999-01-01T14:00:00Z",
                seasonDisplayedEnd: "9999-01-01T07:30:00Z",
                weeklyStoreEnd: "9999-01-01T00:00:00Z",
                stwEventStoreEnd: "9999-01-01T00:00:00.000Z",
                stwWeeklyStoreEnd: "9999-01-01T00:00:00.000Z",
                sectionStoreEnds: {
                    Featured: "9999-01-01T00:00:00.000Z"
                },
                dailyStoreEnd: "9999-01-01T00:00:00Z"
            }
        }];

        // Handle special events that change over time
        this.handleDynamicEvents(states, versionInfo, activeEvents);

        return {
            channels: {
                "client-matchmaking": {
                    states: [],
                    cacheExpire: "9999-01-01T22:28:47.830Z"
                },
                "client-events": {
                    states: states,
                    cacheExpire: "9999-01-01T22:28:47.830Z"
                }
            },
            eventsTimeOffsetHrs: 0,
            cacheIntervalMins: 10,
            currentTime: new Date().toISOString()
        };
    }

    handleDynamicEvents(states, versionInfo, baseActiveEvents) {
        // Handle season 4.5 Rocket Launch event
        if (versionInfo.build === 4.5 && this.config.Events?.bEnableGeodeEvent) {
            const geodeStartDate = this.config.Events.geodeEventStartDate || "2024-01-01T18:00:00.000Z";
            const eventEndDate = new Date(new Date(geodeStartDate).getTime() + 3 * 60000).toISOString();
    
            // Pre-event state
            states[0].activeEvents.push({
                "eventType": "EventFlag.BR_S4_Geode_Countdown",
                "activeUntil": geodeStartDate,
                "activeSince": "2020-01-01T00:00:00.000Z"
            });
    
            // During event state
            const duringEventState = JSON.parse(JSON.stringify(baseActiveEvents));
            duringEventState.push({
                "eventType": "EventFlag.BR_S4_Geode_Begin",
                "activeUntil": eventEndDate,
                "activeSince": geodeStartDate
            });
    
            states.push({
                validFrom: geodeStartDate,
                activeEvents: duringEventState,
                state: states[0].state
            });
    
            // Post-event state
            const postEventState = JSON.parse(JSON.stringify(baseActiveEvents));
            postEventState.push({
                "eventType": "EventFlag.BR_S4_Geode_Over",
                "activeUntil": "9999-01-01T00:00:00.000Z",
                "activeSince": eventEndDate
            });
    
            if (this.config.Events?.bEnableCrackInTheSky) {
                postEventState.push({
                    "eventType": "EventFlag.BR_S4_Rift_Growth",
                    "activeUntil": new Date(new Date(eventEndDate).getTime() + 13.6 * 24 * 60 * 60 * 1000).toISOString(),
                    "activeSince": eventEndDate
                });
            }
    
            states.push({
                validFrom: eventEndDate,
                activeEvents: postEventState,
                state: states[0].state
            });
        }
    
        // Season 5 Events
        if (versionInfo.build === 5.21) {
            if (this.config.Events.bEnableS5OddityPrecursor === true) {
                states.push({
                    validFrom: this.config.Events.S5OddityPrecursorDate,
                    activeEvents: baseActiveEvents.slice(),
                    state: states[0].state
                });
                
                states[1].activeEvents.push({
                    "eventType": "EventFlag.BR_S5_Oddity_Tomato_Tell",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": this.config.Events.S5OddityPrecursorDate
                });
            }
    
            if (this.config.Events.bEnableS5OddityExecution === true) {
                states.push({
                    validFrom: this.config.Events.S5OddityExecutionDate,
                    activeEvents: baseActiveEvents.slice(),
                    state: states[0].state
                });
                
                states[states.length - 1].activeEvents.push({
                    "eventType": "EventFlag.BR_S5_Oddity_Tomato_Event",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": this.config.Events.S5OddityExecutionDate
                });
            }
        }
    
        if (versionInfo.build === 5.30) {
            if (this.config.Events.bEnableBlockbusterRiskyEvent === true) {
                baseActiveEvents.push({
                    "eventType": "EventFlag.BR_S5_RiskyReels_Event",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": "2020-01-01T00:00:00.000Z"
                });
                states[0].activeEvents = baseActiveEvents.slice();
            }
            
            if (this.config.Events.bEnableCubeLightning === true) {
                states[0].activeEvents.push(
                    {
                        "eventType": "EventFlag.BR_S5_Rift_Corrupt",
                        "activeUntil": this.config.Events.cubeSpawnDate,
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    },
                    {
                        "eventType": "EventFlag.BR_S5_Cube_Lightning",
                        "activeUntil": this.config.Events.cubeSpawnDate,
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    }
                );
    
                baseActiveEvents.push({
                    "eventType": "EventFlag.BR_S5_Cube_TurnOn",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": this.config.Events.cubeSpawnDate
                });
    
                states.push({
                    validFrom: this.config.Events.cubeSpawnDate,
                    activeEvents: baseActiveEvents.slice(),
                    state: states[0].state
                });
            }
        }
    
        if (versionInfo.build === 5.41) {
            if (this.config.Events.bEnableCubeLake === true) {
                states[0].activeEvents.push(
                    {
                        "eventType": "EventFlag.BR_S5_Cube_StartMove",
                        "activeUntil": this.config.Events.cubeLakeDate,
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    },
                    {
                        "eventType": "EventFlag.BR_S5_Cube_TurnOn",
                        "activeUntil": this.config.Events.cubeLakeDate,
                        "activeSince": "2020-01-01T00:00:00.000Z"
                    }
                );
                
                states.push({
                    validFrom: this.config.Events.cubeLakeDate,
                    activeEvents: baseActiveEvents.slice(),
                    state: states[0].state
                });
    
                states[1].activeEvents.push(
                    {
                        "eventType": "EventFlag.BR_S5_Cube_StartMove",
                        "activeUntil": this.config.Events.cubeLakeDate,
                        "activeSince": this.config.Events.cubeLakeDate
                    },
                    {
                        "eventType": "EventFlag.BR_S5_Cube_TurnOn",
                        "activeUntil": this.config.Events.cubeLakeDate,
                        "activeSince": this.config.Events.cubeLakeDate
                    },       
                    {
                        "eventType": "EventFlag.BR_S5_Cube_MoveTo8",
                        "activeUntil": this.config.Events.cubeLakeDate,
                        "activeSince": this.config.Events.cubeLakeDate
                    }
                );
    
                const eventEndDate = new Date(new Date(this.config.Events.cubeLakeDate).getTime() + 1.5 * 60000).toISOString();
    
                states.push({
                    validFrom: eventEndDate,
                    activeEvents: baseActiveEvents.slice(),
                    state: states[0].state
                });
    
                states[2].activeEvents.push({
                    "eventType": "EventFlag.BR_S5_Cube_Destination",
                    "activeUntil": "9999-01-01T00:00:00.000Z",
                    "activeSince": eventEndDate
                });
            }
        }
    }
}

// Export singleton instance
module.exports = new TimelineService();