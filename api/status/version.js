const express = require('express');
const router = express.Router();
const VersionService = require('../../src/service/api/VersionService');
const ConfigManager = require('../../src/manager/ConfigManager');
const LoggerService = require('../../src/service/logger/LoggerService');
const { Errors, sendError } = require('../../src/service/error/Errors');

router.get('/fortnite/api/version', (req, res) => {
    try{
        const clientVersion = VersionService.getVersionInfo(req);
    
        const customVersion = ConfigManager.get('customVersion');
        const serverVersion = ConfigManager.get('fnVersion');
    
        const version = customVersion ? clientVersion.build.toString() : serverVersion;
        const build = customVersion ? 'Neodyme' : `++Fortnite+Release-${serverVersion}-CL-${clientVersion.CL}`;
        const branch = `Release-${version}`;
    
        res.json({
            "app": "fortnite",
            "serverDate": new Date().toISOString(),
            "overridePropertiesVersion": "unknown",
            "cln": clientVersion.CL,
            "build": build,
            "moduleName": "Fortnite-Core",
            "buildDate": new Date().toISOString(),
            "version": version,
            "branch": branch,
            "modules": {
                "Epic-LightSwitch-AccessControlCore": {
                    "cln": "17237679",
                    "build": "b2130",
                    "buildDate": "2021-08-19T18:56:08.144Z",
                    "version": "1.0.0",
                    "branch": "trunk"
                },
                "epic-xmpp-api-v1-base": {
                    "cln": "5131a23c1470acbd9c94fae695ef7d899c1a41d6",
                    "build": "b3595",
                    "buildDate": "2019-07-30T09:11:06.587Z",
                    "version": "0.0.1",
                    "branch": "master"
                },
                "epic-common-core": {
                    "cln": "17909521",
                    "build": "3217",
                    "buildDate": "2021-10-25T18:41:12.486Z",
                    "version": "3.0",
                    "branch": "TRUNK"
                }
            }
        });
    } catch (error) {
        LoggerService.log('error', `Version error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/fortnite/api/versioncheck', (req, res) => {
    try{
        const isGood = VersionService.checkVersion(req, res);
        res.json(isGood);
    } catch (error) {
        LoggerService.log('error', `Version error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/fortnite/api/versioncheck/*', (req, res) => {
    try{
        const isGood = VersionService.checkVersion(req, res);
        res.json(isGood);
    } catch (error) {
        LoggerService.log('error', `Version error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/fortnite/api/v2/versioncheck/*', (req, res) => {
    try{
        const isGood = VersionService.checkVersion(req, res);
        res.json(isGood);
    } catch (error) {
        LoggerService.log('error', `Version error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;