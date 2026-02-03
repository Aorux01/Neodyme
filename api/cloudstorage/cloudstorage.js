const express = require('express');
const router = express.Router();
const CloudStorageManager = require('../../src/manager/cloud-storage-manager');
const DatabaseManager = require('../../src/manager/database-manager');
const VersionService = require('../../src/service/api/version-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');

router.use((req, res, next) => {
    if (req.originalUrl.toLowerCase().startsWith("/fortnite/api/cloudstorage/user/") && req.method === "PUT") {
        req.rawBody = "";
        req.setEncoding("latin1");

        req.on("data", (chunk) => req.rawBody += chunk);
        req.on("end", () => next());
    } else {
        next();
    }
});

router.get("/fortnite/api/cloudstorage/system", async (req, res) => {
    try {
        const version = VersionService.getVersionInfo(req);

        if (version.build >= 9.40 && version.build <= 10.40) {
            return res.status(404).end();
        }

        const files = CloudStorageManager.getSystemFiles();
        res.json(files);
    } catch (error) {
        LoggerService.log('error', `CloudStorage system error: ${error.message}`);
        res.json([]);
    }
});

router.get("/fortnite/api/cloudstorage/system/:file", async (req, res) => {
    try {
        const version = VersionService.getVersionInfo(req);
        const fileName = req.params.file;

        const content = CloudStorageManager.getSystemFile(fileName, version.season, version.build);

        if (content) {
            return res.status(200).send(content);
        } else {
            return res.status(200).end();
        }
    } catch (error) {
        LoggerService.log('error', `CloudStorage system file error: ${error.message}`);
        res.status(200).end();
    }
});

router.get("/fortnite/api/cloudstorage/user/:accountId", async (req, res) => {
    try {
        const version = VersionService.getVersionInfo(req);
        const accountId = req.params.accountId;

        const clientSettings = DatabaseManager.getClientSettings(accountId, version.buildId);

        if (clientSettings) {
            res.json([clientSettings]);
        } else {
            res.json([]);
        }
    } catch (error) {
        LoggerService.log('error', `CloudStorage user list error: ${error.message}`);
        res.json([]);
    }
});

router.get("/fortnite/api/cloudstorage/user/*/:file", async (req, res) => {
    try {
        const fileName = req.params.file;

        if (fileName.toLowerCase() !== "clientsettings.sav") {
            return sendError(res, Errors.Basic.notFound());
        }

        const accountId = req.params[0];
        const version = VersionService.getVersionInfo(req);
        const content = DatabaseManager.getClientSettingsFile(accountId, version.buildId);

        res.set('Content-Type', 'application/octet-stream');

        if (content) {
            return res.status(200).send(content);
        } else {
            return res.status(200).end();
        }
    } catch (error) {
        LoggerService.log('error', `CloudStorage user file error: ${error.message}`);
        res.status(200).end();
    }
});

router.put("/fortnite/api/cloudstorage/user/*/:file", async (req, res) => {
    try {
        const fileName = req.params.file;

        if (fileName.toLowerCase() !== "clientsettings.sav") {
            return sendError(res, Errors.Basic.notFound());
        }

        const accountId = req.params[0];
        const version = VersionService.getVersionInfo(req);
        
        DatabaseManager.saveClientSettings(accountId, version.buildId, req.rawBody);
        
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `CloudStorage save error: ${error.message}`);
        res.status(204).end();
    }
});

module.exports = router;