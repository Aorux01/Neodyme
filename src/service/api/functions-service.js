const ConfigManager = require("../../manager/config-manager");
const validator = require('validator');

async function sleep(ms) {
    await new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    })
}

function getTheater(req) {
    const versionInfo = GetVersionInfo(req);

    var theater = JSON.stringify(require("../../../content/campaign/worldstw.json"));
    var Season = "Season" + versionInfo.season;

    try {
        if (versionInfo.build >= 30.20) {
            theater = theater.replace(/\/Game\/World\/ZoneThemes/ig, "/STW_Zones/World/ZoneThemes");
            theater = theater.replace(/\"DataTable\'\/Game\//ig, "\"/Script/Engine.DataTable\'\/Game\/");
        }

        if (versionInfo.build >= 15.30) {
            theater = theater.replace(/\/Game\//ig, "\/SaveTheWorld\/");
            theater = theater.replace(/\"DataTable\'\/SaveTheWorld\//ig, "\"DataTable\'\/Game\/");
        }

        var date = new Date();
        var hour = date.getHours();

        if (versionInfo.season >= 9) {
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

    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
        errors.push('Password must be no more than 128 characters');
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

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
    const ROLE_PREFIXES = { 0: null, 1: "[MODERATOR] ", 2: "[DEVELOPER] ", 3: "[ADMIN] ", 4: "[OWNER] " };
    const prefix = ROLE_PREFIXES[account.clientType || 0];
    return prefix ? `${prefix}${account.displayName}` : account.displayName;
}

function sanitizeInput(input) {
    if (!input || typeof input !== 'string') return '';

    let sanitized = input.trim();

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
