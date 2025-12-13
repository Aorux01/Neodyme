const ConfigManager = require("../../manager/ConfigManager");
const validator = require('validator');

async function sleep(ms) {
    await new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    })
}

function getTheater(req) {
    const memory = GetVersionInfo(req);

    var theater = JSON.stringify(require("../../../content/campaign/worldstw.json"));
    var Season = "Season" + memory.season;

    try {
        if (memory.build >= 30.20) {
            theater = theater.replace(/\/Game\/World\/ZoneThemes/ig, "/STW_Zones/World/ZoneThemes");
            theater = theater.replace(/\"DataTable\'\/Game\//ig, "\"/Script/Engine.DataTable\'\/Game\/");
        }

        if (memory.build >= 15.30) {
            theater = theater.replace(/\/Game\//ig, "\/SaveTheWorld\/");
            theater = theater.replace(/\"DataTable\'\/SaveTheWorld\//ig, "\"DataTable\'\/Game\/");
        }

        var date = new Date();
        var hour = date.getHours();

        if (memory.season >= 9) {
            date.setHours(23, 59, 59, 999);
        } else {
            if (hour < 6) {
                date.setHours(5, 59, 59, 999);
            } else if (hour < 12) {
                date.setHours(11, 59, 59, 999);
            } else if (hour < 18) {
                date.setHours(17, 59, 59, 999);
            } else {
                date.setHours(23, 59, 59, 999);
            }
        }

        date = date.toISOString();

        theater = theater.replace(/2017-07-25T23:59:59.999Z/ig, date);
    } catch (err) {}

    theater = JSON.parse(theater)

    if (theater.hasOwnProperty("Seasonal")) {
        if (theater.Seasonal.hasOwnProperty(Season)) {
            theater.theaters = theater.theaters.concat(theater.Seasonal[Season].theaters);
            theater.missions = theater.missions.concat(theater.Seasonal[Season].missions);
            theater.missionAlerts = theater.missionAlerts.concat(theater.Seasonal[Season].missionAlerts);
        }
        delete theater.Seasonal;
    }

    return theater;
}

function getContentPages(req) {
    const memory = getVersionInfo(req);

    const contentpages = JSON.parse(JSON.stringify(require("../../../content/pages/ContentPages.json")));

    chooseTranslationsInJSON(contentpages, req)

    const news = ["savetheworldnews", "battleroyalenews"];
    try {
        if (memory.build < 5.30) {
            news.forEach(mode => {
                contentpages[mode].news.messages[0].image = "https://fortnite-public-service-prod11.ol.epicgames.com/images/neodyme-public-service/Neodyme_Server.jpg";
                contentpages[mode].news.messages[1].image = "https://fortnite-public-service-prod11.ol.epicgames.com/images/neodyme-public-service/Neodyme_Server.jpg";
            })
        }
    } catch (err) {}

    try {
        const backgrounds = contentpages.dynamicbackgrounds.backgrounds.backgrounds;
        const season = `season${memory.season}${memory.season >= 21 ? "00" : ""}`;
        backgrounds[0].stage = season;
        backgrounds[1].stage = season;

        switch (memory.season) {

            case 9:
                contentpages.lobby.backgroundimage = "";
                contentpages.lobby.stage = "default";
                break;

            case 10:
                backgrounds[0].stage = "seasonx";
                backgrounds[1].stage = "seasonx";
                break;

            case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18: case 19:
                break;

            case 20:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png";
                break;

            case 21:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/s21-lobby-background-2048x1024-2e7112b25dc3.jpg";
                break;

            case 22:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp22-lobby-square-2048x2048-2048x2048-e4e90c6e8018.jpg";
                break;

            case 23:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp23-lobby-2048x1024-2048x1024-26f2c1b27f63.png";
                break;

            case 24:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-ch4s2-bp-lobby-4096x2048-edde08d15f7e.jpg";
                break;

            case 25:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/s25-lobby-4k-4096x2048-4a832928e11f.jpg";
                backgrounds[1].backgroundimage = "https://cdn2.unrealengine.com/fn-shop-ch4s3-04-1920x1080-785ce1d90213.png";
                break;

            case 27:
                backgrounds[0].stage = "rufus";
                break;

            default:
                backgrounds[0].stage = "defaultnotris";
                backgrounds[0].backgroundimage = "https://fortnite-public-service-prod11.ol.epicgames.com/images/lightlobbybg.png";

        }

        switch (memory.build) {

            case 9.30:
                contentpages.lobby.stage = "summer";
                break;

            case 11.10:
                backgrounds[0].stage = "fortnitemares";
                backgrounds[1].stage = "fortnitemares";
                break;

            case 11.31:
            case 11.40:
                backgrounds[0].stage = "winter19";
                backgrounds[1].stage = "winter19";
                break;

            case 19.01:
                backgrounds[0].stage = "winter2021";
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp19-lobby-xmas-2048x1024-f85d2684b4af.png";
                contentpages.subgameinfo.battleroyale.image = "https://cdn2.unrealengine.com/19br-wf-subgame-select-512x1024-16d8bb0f218f.jpg";
                contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
                break;

            case 20.40:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp20-40-armadillo-glowup-lobby-2048x2048-2048x2048-3b83b887cc7f.jpg";
                break;

            case 21.10:
                backgrounds[0].stage = "season2100";
                break;

            case 21.30:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/nss-lobbybackground-2048x1024-f74a14565061.jpg";
                backgrounds[0].stage = "season2130";
                break;

            case 23.10:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp23-winterfest-lobby-square-2048x2048-2048x2048-277a476e5ca6.png";
                contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
                break;

            case 25.11:
                backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-s25-14dos-lobby-4096x2048-2be24969eee3.jpg";

        }

    } catch (err) {}

    return contentpages;
}

function MakeSurvivorAttributes(templateId) {
    const SurvivorData = require("./../responses/Campaign/survivorData.json");
    var SurvivorAttributes = {
        "level": 1,
        "item_seen": false,
        "squad_slot_idx": -1,
        "building_slot_used": -1
    };

    if (SurvivorData.fixedAttributes.hasOwnProperty(templateId)) {
        SurvivorAttributes = {...SurvivorAttributes, ...SurvivorData.fixedAttributes[templateId]};
    }

    if (!SurvivorAttributes.hasOwnProperty("gender")) {
        SurvivorAttributes.gender = (Math.floor(Math.random() * (1 - 3) + 3)).toString(); // Set a random survivor gender ("1" = male, "2" = female)
    }

    if (!SurvivorAttributes.hasOwnProperty("managerSynergy")) {
        var randomNumber = Math.floor(Math.random() * SurvivorData.bonuses.length);
        SurvivorAttributes.set_bonus = SurvivorData.bonuses[randomNumber];
    }

    if (!SurvivorAttributes.hasOwnProperty("personality")) {
        var randomNumber = Math.floor(Math.random() * SurvivorData.personalities.length);
        SurvivorAttributes.personality = SurvivorData.personalities[randomNumber];
    }

    if (!SurvivorAttributes.hasOwnProperty("portrait")) {
        portraitFactor = SurvivorAttributes.personality;
        if (SurvivorAttributes.hasOwnProperty("managerSynergy")) {
            portraitFactor = SurvivorAttributes.managerSynergy;
        }

        var gender = SurvivorAttributes.gender;
        var randomNumber = Math.floor(Math.random() * SurvivorData.portraits[portraitFactor][gender].length);
        SurvivorAttributes.portrait = SurvivorData.portraits[portraitFactor][gender][randomNumber];
    }

    return SurvivorAttributes;
}

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;

    if (email.length < 5 || email.length > 254) return false;

    return validator.isEmail(email, {
        allow_display_name: false,
        require_display_name: false,
        allow_utf8_local_part: false,
        require_tld: true,
        ignore_max_length: false
    });
}

function isValidUsername(username) {
    if (!username || typeof username !== 'string') return false;

    if (username.length < 3 || username.length > 20) return false;

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) return false;

    if (!/^[a-zA-Z]/.test(username)) return false;

    if (username.includes('__')) return false;

    return true;
}

function isValidPassword(password) {
    const errors = [];

    if (!password || typeof password !== 'string') {
        return { valid: false, errors: ['Password is required'] };
    }

    // Minimum length of 8 characters
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    // Maximum length to prevent DoS
    if (password.length > 128) {
        errors.push('Password must be no more than 128 characters');
    }

    // At least one uppercase letter
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    // At least one lowercase letter
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    // At least one number
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    // At least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function isValidPasswordSimple(password) {
    const result = isValidPassword(password);
    return result.valid;
}

function getPasswordValidationError(password) {
    const result = isValidPassword(password);
    if (result.valid) return null;
    return result.errors.join('. ');
}

function generateRandomString(length = 16) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function MakeID() {
    return uuid.v4();
}

function getDisplayNameWithRole(account) {
    const ROLE_PREFIXES = { 0: null, 1: "[FOUNDER] ", 2: "[ADMIN] ", 3: "[MODO] ", 4: "[HELPER] " };
    const prefix = ROLE_PREFIXES[account.clientType || 0];
    return prefix ? `${prefix} ${account.displayName}` : account.displayName;
}

function sanitizeInput(input) {
    if (!input || typeof input !== 'string') return '';

    // Trim whitespace
    let sanitized = input.trim();

    // Escape HTML entities
    sanitized = validator.escape(sanitized);

    return sanitized;
}

function validateAuthInput(input) {
    const errors = [];
    const sanitized = {};

    if (input.email) {
        const email = input.email.trim().toLowerCase();
        if (!isValidEmail(email)) {
            errors.push('Invalid email format');
        } else {
            sanitized.email = email;
        }
    }

    if (input.username) {
        const username = input.username.trim();
        if (!isValidUsername(username)) {
            errors.push('Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores');
        } else {
            sanitized.username = username;
        }
    }

    if (input.password) {
        const passwordResult = isValidPassword(input.password);
        if (!passwordResult.valid) {
            errors.push(...passwordResult.errors);
        } else {
            sanitized.password = input.password; // Don't sanitize passwords, they need special chars
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors,
        sanitized: sanitized
    };
}

module.exports = {
    sleep,
    getTheater,
    getContentPages,
    MakeSurvivorAttributes,
    isValidEmail,
    isValidUsername,
    isValidPassword,
    isValidPasswordSimple,
    getPasswordValidationError,
    generateRandomString,
    MakeID,
    getDisplayNameWithRole,
    sanitizeInput,
    validateAuthInput
}
