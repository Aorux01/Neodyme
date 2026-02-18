const fs = require('fs');
const path = require('path');
const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager')

class VersionService {
    normalizeVersion(version) {
        const parts = version.split('.');
        if (parts.length >= 3) {
            if (parts[2] === '00' || parts[2] === '0') {
                return `${parts[0]}.${parts[1]}`;
            }
        }
        return version;
    }

    initializeSupportedVersions() {
        const versions = {
            // Season 1
            "1.7.2": { season: 1, build: 1.72, lobby: "LobbySeason1" },
            "1.8": { season: 1, build: 1.8, lobby: "LobbySeason1" },
            "1.8.1": { season: 1, build: 1.81, lobby: "LobbySeason1" },
            "1.8.2": { season: 1, build: 1.82, lobby: "LobbySeason1" },
            "1.9": { season: 1, build: 1.9, lobby: "LobbySeason1" },
            "1.9.1": { season: 1, build: 1.91, lobby: "LobbySeason1" },
            "1.10": { season: 1, build: 1.10, lobby: "LobbySeason1" },
            "1.11": { season: 1, build: 1.11, lobby: "LobbySeason1" },

            // Season 2
            "2.1.0": { season: 2, build: 2.1, lobby: "LobbyWinterDecor" },
            "2.2.0": { season: 2, build: 2.2, lobby: "LobbyWinterDecor" },
            "2.3.0": { season: 2, build: 2.3, lobby: "LobbyWinterDecor" },
            "2.3.2": { season: 2, build: 2.32, lobby: "LobbyWinterDecor" },
            "2.4.0": { season: 2, build: 2.4, lobby: "LobbyWinterDecor" },
            "2.4.2": { season: 2, build: 2.42, lobby: "LobbyWinterDecor" },
            "2.5": { season: 2, build: 2.5, lobby: "LobbyWinterDecor" },

            // Season 3
            "3.0": { season: 3, build: 3.0, lobby: "LobbySeason3" },
            "3.0.0": { season: 3, build: 3.0, lobby: "LobbySeason3" },
            "3.1": { season: 3, build: 3.1, lobby: "LobbySeason3" },
            "3.2": { season: 3, build: 3.2, lobby: "LobbySeason3" },
            "3.3": { season: 3, build: 3.3, lobby: "LobbySeason3" },
            "3.4": { season: 3, build: 3.4, lobby: "LobbySeason3" },
            "3.5": { season: 3, build: 3.5, lobby: "LobbySeason3" },
            "3.6": { season: 3, build: 3.6, lobby: "LobbySeason3" },

            // Season 4
            "4.0": { season: 4, build: 4.0, lobby: "LobbySeason4" },
            "4.1": { season: 4, build: 4.1, lobby: "LobbySeason4" },
            "4.2": { season: 4, build: 4.2, lobby: "LobbySeason4" },
            "4.3": { season: 4, build: 4.3, lobby: "LobbySeason4" },
            "4.4": { season: 4, build: 4.4, lobby: "LobbySeason4" },
            "4.4.1": { season: 4, build: 4.41, lobby: "LobbySeason4" },
            "4.5": { season: 4, build: 4.5, lobby: "LobbySeason4" },

            // Season 5
            "5.0": { season: 5, build: 5.0, lobby: "LobbySeason5" },
            "5.10": { season: 5, build: 5.10, lobby: "LobbySeason5" },
            "5.20": { season: 5, build: 5.20, lobby: "LobbySeason5" },
            "5.21": { season: 5, build: 5.21, lobby: "LobbySeason5" },
            "5.30": { season: 5, build: 5.30, lobby: "LobbySeason5" },
            "5.40": { season: 5, build: 5.40, lobby: "LobbySeason5" },
            "5.41": { season: 5, build: 5.41, lobby: "LobbySeason5" },

            // Season 6
            "6.00": { season: 6, build: 6.0, lobby: "LobbySeason6" },
            "6.01": { season: 6, build: 6.01, lobby: "LobbySeason6" },
            "6.02": { season: 6, build: 6.02, lobby: "LobbySeason6" },
            "6.10": { season: 6, build: 6.10, lobby: "LobbySeason6" },
            "6.20": { season: 6, build: 6.20, lobby: "LobbySeason6Halloween" },
            "6.21": { season: 6, build: 6.21, lobby: "LobbySeason6Halloween" },
            "6.22": { season: 6, build: 6.22, lobby: "LobbySeason6" },
            "6.30": { season: 6, build: 6.30, lobby: "LobbySeason6" },
            "6.31": { season: 6, build: 6.31, lobby: "LobbySeason6" },

            // Season 7
            "7.00": { season: 7, build: 7.0, lobby: "LobbyWinterDecor2018" },
            "7.01": { season: 7, build: 7.01, lobby: "LobbyWinterDecor2018" },
            "7.10": { season: 7, build: 7.10, lobby: "LobbyWinterDecor2018" },
            "7.20": { season: 7, build: 7.20, lobby: "LobbyWinterDecor2018" },
            "7.30": { season: 7, build: 7.30, lobby: "LobbyWinterDecor2018" },
            "7.40": { season: 7, build: 7.40, lobby: "LobbyWinterDecor2018" },

            // Season 8
            "8.00": { season: 8, build: 8.0, lobby: "LobbySeason8" },
            "8.01": { season: 8, build: 8.01, lobby: "LobbySeason8" },
            "8.10": { season: 8, build: 8.10, lobby: "LobbySeason8" },
            "8.11": { season: 8, build: 8.11, lobby: "LobbySeason8" },
            "8.20": { season: 8, build: 8.20, lobby: "LobbySeason8" },
            "8.30": { season: 8, build: 8.30, lobby: "LobbySeason8" },
            "8.40": { season: 8, build: 8.40, lobby: "LobbySeason8" },
            "8.50": { season: 8, build: 8.50, lobby: "LobbySeason8" },
            "8.51": { season: 8, build: 8.51, lobby: "LobbySeason8" },

            // Season 9
            "9.00": { season: 9, build: 9.0, lobby: "LobbySeason9" },
            "9.01": { season: 9, build: 9.01, lobby: "LobbySeason9" },
            "9.10": { season: 9, build: 9.10, lobby: "LobbySeason9" },
            "9.20": { season: 9, build: 9.20, lobby: "LobbySeason9" },
            "9.21": { season: 9, build: 9.21, lobby: "LobbySeason9" },
            "9.30": { season: 9, build: 9.30, lobby: "LobbySeason9" },
            "9.40": { season: 9, build: 9.40, lobby: "LobbySeason9" },
            "9.41": { season: 9, build: 9.41, lobby: "LobbySeason9" },

            // Season 10
            "10.00": { season: 10, build: 10.0, lobby: "LobbySeasonX" },
            "10.10": { season: 10, build: 10.10, lobby: "LobbySeasonX" },
            "10.20": { season: 10, build: 10.20, lobby: "LobbySeasonX" },
            "10.30": { season: 10, build: 10.30, lobby: "LobbySeasonX" },
            "10.31": { season: 10, build: 10.31, lobby: "LobbySeasonX" },
            "10.40": { season: 10, build: 10.40, lobby: "LobbySeasonX" },

            // Chapter 2 Season 1 (11)
            "11.00": { season: 11, build: 11.0, lobby: "LobbyChapter2Season1" },
            "11.01": { season: 11, build: 11.01, lobby: "LobbyChapter2Season1" },
            "11.10": { season: 11, build: 11.10, lobby: "LobbyChapter2Season1" },
            "11.11": { season: 11, build: 11.11, lobby: "LobbyChapter2Season1" },
            "11.20": { season: 11, build: 11.20, lobby: "LobbyChapter2Season1" },
            "11.21": { season: 11, build: 11.21, lobby: "LobbyChapter2Season1" },
            "11.30": { season: 11, build: 11.30, lobby: "LobbyChapter2Season1" },
            "11.31": { season: 11, build: 11.31, lobby: "LobbyChapter2Season1" },
            "11.40": { season: 11, build: 11.40, lobby: "LobbyChapter2Season1" },
            "11.50": { season: 11, build: 11.50, lobby: "LobbyChapter2Season1" },

            // Chapter 2 Season 2 (12)
            "12.00": { season: 12, build: 12.0, lobby: "LobbyChapter2Season2" },
            "12.10": { season: 12, build: 12.10, lobby: "LobbyChapter2Season2" },
            "12.20": { season: 12, build: 12.20, lobby: "LobbyChapter2Season2" },
            "12.30": { season: 12, build: 12.30, lobby: "LobbyChapter2Season2" },
            "12.40": { season: 12, build: 12.40, lobby: "LobbyChapter2Season2" },
            "12.41": { season: 12, build: 12.41, lobby: "LobbyChapter2Season2" },
            "12.50": { season: 12, build: 12.50, lobby: "LobbyChapter2Season2" },
            "12.60": { season: 12, build: 12.60, lobby: "LobbyChapter2Season2" },
            "12.61": { season: 12, build: 12.61, lobby: "LobbyChapter2Season2" },

            // Chapter 2 Season 3 (13)
            "13.00": { season: 13, build: 13.0, lobby: "LobbyChapter2Season3" },
            "13.20": { season: 13, build: 13.20, lobby: "LobbyChapter2Season3" },
            "13.30": { season: 13, build: 13.30, lobby: "LobbyChapter2Season3" },
            "13.40": { season: 13, build: 13.40, lobby: "LobbyChapter2Season3" },

            // Chapter 2 Season 4 (14)
            "14.00": { season: 14, build: 14.0, lobby: "LobbyChapter2Season4" },
            "14.10": { season: 14, build: 14.10, lobby: "LobbyChapter2Season4" },
            "14.20": { season: 14, build: 14.20, lobby: "LobbyChapter2Season4" },
            "14.30": { season: 14, build: 14.30, lobby: "LobbyChapter2Season4" },
            "14.40": { season: 14, build: 14.40, lobby: "LobbyChapter2Season4" },
            "14.50": { season: 14, build: 14.50, lobby: "LobbyChapter2Season4" },
            "14.60": { season: 14, build: 14.60, lobby: "LobbyChapter2Season4" },

            // Chapter 2 Season 5 (15)
            "15.00": { season: 15, build: 15.0, lobby: "LobbyChapter2Season5" },
            "15.10": { season: 15, build: 15.10, lobby: "LobbyChapter2Season5" },
            "15.20": { season: 15, build: 15.20, lobby: "LobbyChapter2Season5" },
            "15.21": { season: 15, build: 15.21, lobby: "LobbyChapter2Season5" },
            "15.30": { season: 15, build: 15.30, lobby: "LobbyChapter2Season5" },
            "15.40": { season: 15, build: 15.40, lobby: "LobbyChapter2Season5" },
            "15.50": { season: 15, build: 15.50, lobby: "LobbyChapter2Season5" },

            // Chapter 2 Season 6 (16)
            "16.00": { season: 16, build: 16.0, lobby: "LobbyChapter2Season6" },
            "16.10": { season: 16, build: 16.10, lobby: "LobbyChapter2Season6" },
            "16.20": { season: 16, build: 16.20, lobby: "LobbyChapter2Season6" },
            "16.30": { season: 16, build: 16.30, lobby: "LobbyChapter2Season6" },
            "16.40": { season: 16, build: 16.40, lobby: "LobbyChapter2Season6" },
            "16.50": { season: 16, build: 16.50, lobby: "LobbyChapter2Season6" },

            // Chapter 2 Season 7 (17)
            "17.00": { season: 17, build: 17.0, lobby: "LobbyChapter2Season7" },
            "17.10": { season: 17, build: 17.10, lobby: "LobbyChapter2Season7" },
            "17.20": { season: 17, build: 17.20, lobby: "LobbyChapter2Season7" },
            "17.21": { season: 17, build: 17.21, lobby: "LobbyChapter2Season7" },
            "17.30": { season: 17, build: 17.30, lobby: "LobbyChapter2Season7" },
            "17.40": { season: 17, build: 17.40, lobby: "LobbyChapter2Season7" },
            "17.50": { season: 17, build: 17.50, lobby: "LobbyChapter2Season7" },

            // Chapter 2 Season 8 (18)
            "18.00": { season: 18, build: 18.0, lobby: "LobbyChapter2Season8" },
            "18.10": { season: 18, build: 18.10, lobby: "LobbyChapter2Season8" },
            "18.20": { season: 18, build: 18.20, lobby: "LobbyChapter2Season8" },
            "18.21": { season: 18, build: 18.21, lobby: "LobbyChapter2Season8" },
            "18.30": { season: 18, build: 18.30, lobby: "LobbyChapter2Season8" },
            "18.40": { season: 18, build: 18.40, lobby: "LobbyChapter2Season8" },

            // Chapter 3 Season 1 (19)
            "19.00": { season: 19, build: 19.0, lobby: "LobbyChapter3Season1" },
            "19.01": { season: 19, build: 19.01, lobby: "LobbyChapter3Season1" },
            "19.10": { season: 19, build: 19.10, lobby: "LobbyChapter3Season1" },
            "19.20": { season: 19, build: 19.20, lobby: "LobbyChapter3Season1" },
            "19.30": { season: 19, build: 19.30, lobby: "LobbyChapter3Season1" },
            "19.40": { season: 19, build: 19.40, lobby: "LobbyChapter3Season1" },

            // Chapter 3 Season 2 (20)
            "20.00": { season: 20, build: 20.0, lobby: "LobbyChapter3Season2" },
            "20.10": { season: 20, build: 20.10, lobby: "LobbyChapter3Season2" },
            "20.20": { season: 20, build: 20.20, lobby: "LobbyChapter3Season2" },
            "20.30": { season: 20, build: 20.30, lobby: "LobbyChapter3Season2" },
            "20.40": { season: 20, build: 20.40, lobby: "LobbyChapter3Season2" },

            // Chapter 3 Seasons (21)
            "21.00": { season: 21, build: 21.0, lobby: "LobbyChapter3Season3" },
            "21.10": { season: 21, build: 21.10, lobby: "LobbyChapter3Season3" },
            "21.20": { season: 21, build: 21.20, lobby: "LobbyChapter3Season3" },
            "21.30": { season: 21, build: 21.30, lobby: "LobbyChapter3Season3" },
            "21.40": { season: 21, build: 21.40, lobby: "LobbyChapter3Season3" },
            "21.50": { season: 21, build: 21.50, lobby: "LobbyChapter3Season3" },
            "21.51": { season: 21, build: 21.51, lobby: "LobbyChapter3Season3" },

            // Chapter 3 Seasons (22)
            "22.00": { season: 22, build: 22.0, lobby: "LobbyChapter3Season4" },
            "22.10": { season: 22, build: 22.10, lobby: "LobbyChapter3Season4" },
            "22.20": { season: 22, build: 22.20, lobby: "LobbyChapter3Season4" },
            "22.30": { season: 22, build: 22.30, lobby: "LobbyChapter3Season4" },
            "22.40": { season: 22, build: 22.40, lobby: "LobbyChapter3Season4" },

            // Chapter 4 Seasons 1 (23)
            "23.00": { season: 23, build: 23.0, lobby: "LobbyChapter4Season1" },
            "23.10": { season: 23, build: 23.10, lobby: "LobbyChapter4Season1" },
            "23.20": { season: 23, build: 23.20, lobby: "LobbyChapter4Season1" },
            "23.30": { season: 23, build: 23.30, lobby: "LobbyChapter4Season1" },
            "23.40": { season: 23, build: 23.40, lobby: "LobbyChapter4Season1" },

            // Chapter 4 Seasons 2 (24)
            "24.00": { season: 24, build: 24.0, lobby: "LobbyChapter4Season2" },
            "24.01": { season: 24, build: 24.01, lobby: "LobbyChapter4Season2" },
            "24.10": { season: 24, build: 24.10, lobby: "LobbyChapter4Season2" },
            "24.20": { season: 24, build: 24.20, lobby: "LobbyChapter4Season2" },
            "24.30": { season: 24, build: 24.30, lobby: "LobbyChapter4Season2" },
            "24.40": { season: 24, build: 24.40, lobby: "LobbyChapter4Season2" },

            // Chapter 4 Seasons 3 (25)
            "25.00": { season: 25, build: 25.0, lobby: "LobbyChapter4Season3" },
            "25.10": { season: 25, build: 25.10, lobby: "LobbyChapter4Season3" },
            "25.11": { season: 25, build: 25.11, lobby: "LobbyChapter4Season3" },
            "25.20": { season: 25, build: 25.20, lobby: "LobbyChapter4Season3" },
            "25.30": { season: 25, build: 25.30, lobby: "LobbyChapter4Season3" },

            // Chapter 4 Seasons 4 (26)
            "26.00": { season: 26, build: 26.0, lobby: "LobbyChapter4Season4" },
            "26.10": { season: 26, build: 26.10, lobby: "LobbyChapter4Season4" },
            "26.20": { season: 26, build: 26.20, lobby: "LobbyChapter4Season4" },
            "26.30": { season: 26, build: 26.30, lobby: "LobbyChapter4Season4" },

            // Chapter 4 Seasons 5 (27)
            "27.00": { season: 27, build: 27.0, lobby: "LobbyChapter4Season5" },
            "27.10": { season: 27, build: 27.10, lobby: "LobbyChapter4Season5" },
            "27.11": { season: 27, build: 27.11, lobby: "LobbyChapter4Season5" },

            // Chapter 5 Seasons 1 (28)
            "28.00": { season: 28, build: 28.0, lobby: "LobbyChapter5Season1" },
            "28.01": { season: 28, build: 28.01, lobby: "LobbyChapter5Season1" },
            "28.01.01": { season: 28, build: 28.0101, lobby: "LobbyChapter5Season1" },
            "28.10": { season: 28, build: 28.10, lobby: "LobbyChapter5Season1" },
            "28.20": { season: 28, build: 28.20, lobby: "LobbyChapter5Season1" },
            "28.30": { season: 28, build: 28.30, lobby: "LobbyChapter5Season1" },

            // Chapter 5 Seasons 2 (29)
            "29.00": { season: 29, build: 29.0, lobby: "LobbyChapter5Season2" },
            "29.10": { season: 29, build: 29.10, lobby: "LobbyChapter5Season2" },
            "29.20": { season: 29, build: 29.20, lobby: "LobbyChapter5Season2" },
            "29.30": { season: 29, build: 29.30, lobby: "LobbyChapter5Season2" },
            "29.40": { season: 29, build: 29.40, lobby: "LobbyChapter5Season2" },

            // Chapter 5 Seasons 3 (30)
            "30.00": { season: 30, build: 30.0, lobby: "LobbyChapter5Season3" },
            "30.10": { season: 30, build: 30.10, lobby: "LobbyChapter5Season3" },
            "30.20": { season: 30, build: 30.20, lobby: "LobbyChapter5Season3" },
            "30.30": { season: 30, build: 30.30, lobby: "LobbyChapter5Season3" },
            "30.40": { season: 30, build: 30.40, lobby: "LobbyChapter5Season3" },

            // Chapter 5 Seasons 4 (31)
            "31.00": { season: 31, build: 31.0, lobby: "LobbyChapter5Season4" },
            "31.10": { season: 31, build: 31.10, lobby: "LobbyChapter5Season4" },
            "31.20": { season: 31, build: 31.20, lobby: "LobbyChapter5Season4" },
            "31.30": { season: 31, build: 31.30, lobby: "LobbyChapter5Season4" },
            "31.40": { season: 31, build: 31.40, lobby: "LobbyChapter5Season4" },
            "31.41": { season: 31, build: 31.41, lobby: "LobbyChapter5Season4" },

            // Chapter 5 Seasons 5 (32)
            "32.00": { season: 32, build: 32.0, lobby: "LobbyChapter5Season5" },
            "32.10": { season: 32, build: 32.10, lobby: "LobbyChapter5Season5" },
            "32.11": { season: 32, build: 32.11, lobby: "LobbyChapter5Season5" },

        };

        LoggerService.log('debug', `Initialized ${Object.keys(versions).length} supported versions`);
        return versions;
    }

    getVersionInfo(req) {
        var versionInfo = {
            season: 0,
            build: 0.0,
            CL: "",
            lobby: ""
        }

        if (req.headers["user-agent"]) {
            var CL = "";

            try {
                var BuildID = req.headers["user-agent"].split("-")[3].split(",")[0]
                if (!Number.isNaN(Number(BuildID))) {
                    CL = BuildID;
                }

                if (Number.isNaN(Number(BuildID))) {
                    var BuildID = req.headers["user-agent"].split("-")[3].split(" ")[0]
                    if (!Number.isNaN(Number(BuildID))) {
                        CL = BuildID;
                    }
                }
            } catch (err) {
                try {
                    var BuildID = req.headers["user-agent"].split("-")[1].split("+")[0]
                    if (!Number.isNaN(Number(BuildID))) {
                        CL = BuildID;
                    }
                } catch (err) {
                    LoggerService.log('warn', `Failed to extract BuildID from user-agent: ${req.headers["user-agent"]}`);
                }
            }

            try {
                var Build = req.headers["user-agent"].split("Release-")[1].split("-")[0];

                if (Build.split(".").length == 3) {
                    Value = Build.split(".");
                    Build = Value[0] + "." + Value[1] + Value[2];
                }

                versionInfo.season = Number(Build.split(".")[0]);
                versionInfo.build = Number(Build);
                versionInfo.CL = CL;
                versionInfo.lobby = `LobbySeason${versionInfo.season}`;

                if (Number.isNaN(versionInfo.season)) {
                    throw new Error();
                }
            } catch (err) {
                LoggerService.log('warn', 'Failed to parse version info, using defaults');
                versionInfo.season = 2;
                versionInfo.build = 2.0;
                versionInfo.CL = CL;
                versionInfo.lobby = "LobbyWinterDecor";
            }
        }
        return versionInfo;
    }

    checkVersion(req, res) {
        try {
            if (ConfigManager.get('customVersion')) {
                return {
                    "type": "NO_UPDATE"
                };
            } else {
                const currentVersion = this.getVersionInfo(req);
                const targetVersion = ConfigManager.get('fnVersion');
                if (currentVersion.build.toString() !== targetVersion) {
                    return {
                        "type": "HARD_UPDATE",
                    };
                } else {
                    return {
                        "type": "NO_UPDATE"
                    };
                }
            }
        } catch(error) {
            return {
                "type": "NO_UPDATE"
            };
        }
    }
}

module.exports = new VersionService();