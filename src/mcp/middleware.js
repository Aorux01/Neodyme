const { Errors, sendError } = require("../errors/errors");
const LoggerService = require("../../src/utils/logger");
const fs = require("fs").promises;
const path = require("path");
const TokenService = require("../services/TokenService");

async function validateMCP(req, res, next) {
    try {
        // First, verify the token
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return sendError(res, Errors.Authentication.invalidHeader());
        }

        try {
            const token = TokenService.extractTokenFromHeader(authHeader);
            const decoded = TokenService.verifyToken(token);
            
            // Add user info to request
            req.user = decoded;
            req.accountId = decoded.accountId;
        } catch (error) {
            LoggerService.log('error', `Token verification failed: ${error}`);
            return sendError(res, Errors.Authentication.invalidToken("Invalid or expired token"));
        }

        // Validate profile query parameter
        if (!req.query.profileId && req.originalUrl.toLowerCase().includes("/fortnite/api/game/v2/profile/")) {
            return sendError(res, Errors.MCP.invalidPayload());
        }

        // Ensure player directory exists
        const playerDir = path.join(process.cwd(), "data", "players", req.accountId);
        try {
            await fs.access(playerDir);
        } catch {
            // Create player directory if it doesn't exist
            await fs.mkdir(playerDir, { recursive: true });
            
            // Copy template files
            const templateDir = path.join(process.cwd(), "template");
            const templates = await fs.readdir(templateDir);
            
            for (const template of templates) {
                if (template.endsWith('.json')) {
                    const templatePath = path.join(templateDir, template);
                    const playerFilePath = path.join(playerDir, template);
                    const content = await fs.readFile(templatePath, 'utf8');
                    await fs.writeFile(playerFilePath, content);
                }
            }
            
            LoggerService.info(`Created player directory for ${req.accountId}`);
        }

        next();
    } catch (error) {
        LoggerService.log('error', `MCP validation error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
}

// Middleware to extract account ID from URL for dedicated server routes
async function validateDedicatedServer(req, res, next) {
    try {
        // Extract account ID from URL params
        const urlParts = req.path.split('/');
        const profileIndex = urlParts.indexOf('profile');
        
        if (profileIndex !== -1 && profileIndex + 1 < urlParts.length) {
            req.accountId = urlParts[profileIndex + 1];
            req.params.accountId = req.accountId;
        }

        // Dedicated server requests might not have auth headers
        // but they should have account ID in the URL
        if (!req.accountId) {
            return sendError(res, Errors.MCP.profileNotFound("unknown"));
        }

        next();
    } catch (error) {
        LoggerService.log('error', `Dedicated server validation error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
}

module.exports = { validateMCP, validateDedicatedServer };