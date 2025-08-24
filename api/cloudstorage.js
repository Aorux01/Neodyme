const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AuthService = require('../src/services/AuthService');
const { Errors, sendError } = require('../src/errors/errors');
const Functions = require('../src/utils/functions');
const VersionService = require('../src/services/VersionService');
const LoggerService = require("../src/utils/logger");
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();

// Middleware to capture raw body for ClientSettings
router.use((req, res, next) => {
    if (req.originalUrl.toLowerCase().includes('/fortnite/api/cloudstorage/user/') && req.method === 'PUT') {
        req.rawBody = '';
        req.setEncoding('latin1');
        
        req.on('data', (chunk) => req.rawBody += chunk);
        req.on('end', () => next());
    } else {
        next();
    }
});

// Helper function to ensure user cloud storage directory exists
async function ensureUserCloudStorageDir(accountId) {
    const userCloudStorageDir = path.join(process.cwd(), 'data', 'players', accountId, 'cloudstorage');
    
    try {
        await fs.promises.mkdir(userCloudStorageDir, { recursive: true });
        return userCloudStorageDir;
    } catch (error) {
        LoggerService.log('error', `Failed to create user cloud storage directory: ${error}`);
        throw error;
    }
}

// Helper function to verify account exists in clients.json
async function verifyAccountExists(accountId) {
    try {
        const clientsPath = path.join(process.cwd(), 'data', 'clients.json');
        const clientsData = await fs.promises.readFile(clientsPath, 'utf8');
        const clients = JSON.parse(clientsData);
        
        return clients.some(client => client.accountId === accountId);
    } catch (error) {
        LoggerService.log('error', `Failed to verify account exists: ${error}`);
        return false;
    }
}

// Get system cloud storage files
router.get('/fortnite/api/cloudstorage/system', async (req, res) => {
    try {
        const cloudStorageDir = path.join(process.cwd(), 'cloudstorage');
        const cloudFiles = [];

        // Create directory if it doesn't exist
        if (!fs.existsSync(cloudStorageDir)) {
            fs.mkdirSync(cloudStorageDir, { recursive: true });
        }

        // Read all .ini files from cloudstorage directory
        const files = fs.readdirSync(cloudStorageDir);
        
        for (const fileName of files) {
            if (fileName.toLowerCase().endsWith('.ini')) {
                const filePath = path.join(cloudStorageDir, fileName);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const fileStats = fs.statSync(filePath);
                
                cloudFiles.push({
                    uniqueFilename: fileName,
                    filename: fileName,
                    hash: crypto.createHash('sha1').update(fileContent).digest('hex'),
                    hash256: crypto.createHash('sha256').update(fileContent).digest('hex'),
                    length: fileContent.length,
                    contentType: 'application/octet-stream',
                    uploaded: fileStats.mtime.toISOString(),
                    storageType: 'S3',
                    storageIds: {},
                    doNotCache: true
                });
            }
        }

        res.json(cloudFiles);
    } catch (error) {
        LoggerService.log('error', `Error reading cloud storage: ${error}`);
        res.json([]);
    }
});

// Get system cloud storage file
router.get('/fortnite/api/cloudstorage/system/:file', async (req, res) => {
    try {
        const filePath = path.join(process.cwd(), 'cloudstorage', req.params.file);
        
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath);
            res.status(200).send(fileContent);
        } else {
            res.status(404).json({
                error: 'File not found'
            });
        }
    } catch (error) {
        LoggerService.log('error', `Error reading cloud storage file: ${error}`);
        res.status(404).json({
            error: 'File not found'
        });
    }
});

// Get user cloud storage file
router.get('/fortnite/api/cloudstorage/user/:accountId/:file', requireAuth, async (req, res) => {
    try {
        const { accountId, file } = req.params;
        
        // Verify account exists
        if (!(await verifyAccountExists(accountId))) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }

        // Only allow ClientSettings.Sav for now
        if (file.toLowerCase() !== 'clientsettings.sav') {
            return res.status(404).json({
                error: 'File not found'
            });
        }

        // Get user's cloud storage directory
        const userCloudStorageDir = await ensureUserCloudStorageDir(accountId);
        const filePath = path.join(userCloudStorageDir, 'ClientSettings.Sav');

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath);
            res.set('Content-Type', 'application/octet-stream');
            res.status(200).send(fileContent);
        } else {
            // Return empty response if file doesn't exist
            res.status(200).end();
        }
    } catch (error) {
        LoggerService.log('error', `Error reading user cloud storage file: ${error}`);
        res.status(200).end();
    }
});

// Get user cloud storage list
router.get('/fortnite/api/cloudstorage/user/:accountId', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        // Verify account exists
        if (!(await verifyAccountExists(accountId))) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }

        // Get user's cloud storage directory
        const userCloudStorageDir = await ensureUserCloudStorageDir(accountId);
        const clientSettingsPath = path.join(userCloudStorageDir, 'ClientSettings.Sav');

        if (fs.existsSync(clientSettingsPath)) {
            const fileContent = fs.readFileSync(clientSettingsPath, 'latin1');
            const fileStats = fs.statSync(clientSettingsPath);
            
            res.json([{
                uniqueFilename: 'ClientSettings.Sav',
                filename: 'ClientSettings.Sav',
                hash: crypto.createHash('sha1').update(fileContent).digest('hex'),
                hash256: crypto.createHash('sha256').update(fileContent).digest('hex'),
                length: Buffer.byteLength(fileContent),
                contentType: 'application/octet-stream',
                uploaded: fileStats.mtime.toISOString(),
                storageType: 'S3',
                storageIds: {},
                accountId: accountId,
                doNotCache: true
            }]);
        } else {
            res.json([]);
        }
    } catch (error) {
        LoggerService.log('error', `Error listing user cloud storage: ${error}`);
        res.json([]);
    }
});

// Upload user cloud storage file
router.put('/fortnite/api/cloudstorage/user/:accountId/:file', requireAuth, async (req, res) => {
    try {
        const { accountId, file } = req.params;

        // Verify the authenticated user matches the account ID
        if (req.user.accountId !== accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        // Verify account exists
        if (!(await verifyAccountExists(accountId))) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }

        // Only allow ClientSettings.Sav for now
        if (file.toLowerCase() !== 'clientsettings.sav') {
            return res.status(404).json({
                error: 'File not found'
            });
        }

        // Get user's cloud storage directory
        const userCloudStorageDir = await ensureUserCloudStorageDir(accountId);
        const savePath = path.join(userCloudStorageDir, 'ClientSettings.Sav');

        // Save the file
        await fs.promises.writeFile(savePath, req.rawBody, 'latin1');
        
        LoggerService.log('success', `Saved cloud storage file for account ${accountId}: ${file}`);
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Error saving user cloud storage: ${error}`);
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Cloud storage system config endpoint
router.get('/fortnite/api/cloudstorage/system/config', async (req, res) => {
    try {
        LoggerService.log('debug', `Cloud storage system config requested from ${req.ip}`);
        
        // Return Fortnite cloud storage system configuration
        res.json({
            "lastModified": new Date().toISOString(),
            "length": 0,
            "contentType": "application/json",
            "uniqueFilename": "config",
            "doNotCache": false,
            "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "hash256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "uploaded": new Date().toISOString(),
            "storageType": "S3",
            "storageIds": {},
            "accountId": "system",
            "uniqueFilename": "config",
            "filename": "config"
        });
        
    } catch (error) {
        LoggerService.log('debug', `Error in cloud storage config: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Delete user cloud storage file
router.delete('/fortnite/api/cloudstorage/user/:accountId/:file', requireAuth, async (req, res) => {
    try {
        const { accountId, file } = req.params;

        // Verify the authenticated user matches the account ID
        if (req.user.accountId !== accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        // Verify account exists
        if (!(await verifyAccountExists(accountId))) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }

        // Only allow ClientSettings.Sav for now
        if (file.toLowerCase() !== 'clientsettings.sav') {
            return res.status(404).json({
                error: 'File not found'
            });
        }

        // Get user's cloud storage directory
        const userCloudStorageDir = await ensureUserCloudStorageDir(accountId);
        const filePath = path.join(userCloudStorageDir, 'ClientSettings.Sav');

        // Delete the file if it exists
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            LoggerService.log('success', `Deleted cloud storage file for account ${accountId}: ${file}`);
        }

        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Error deleting user cloud storage: ${error}`);
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

module.exports = router;