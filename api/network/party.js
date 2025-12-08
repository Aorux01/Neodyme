const express = require('express');
const router = express.Router();
const PartyManager = require('../../src/manager/PartyManager');
const LoggerService = require('../../src/service/logger/LoggerService');
const { Errors, sendError } = require('../../src/service/error/Errors');

router.get("/party/api/v1/Fortnite/user/*", async (req, res) => {
    try {
        const accountId = req.params[0];
        const parties = PartyManager.getUserParties(accountId);
        res.json(parties);
    } catch (error) {
        LoggerService.log('error', `Get user parties error: ${error.message}`);
        res.json({
            current: [],
            pending: [],
            invites: [],
            pings: []
        });
    }
});

router.post("/party/api/v1/Fortnite/parties", async (req, res) => {
    try {
        if (!req.body.join_info || !req.body.join_info.connection) {
            return res.json({});
        }

        const accountId = (req.body.join_info.connection.id || "").split("@prod")[0];
        
        const config = req.body.config || {};
        const meta = req.body.join_info.meta || {};
        const connectionMeta = req.body.join_info.connection.meta || {};

        const party = PartyManager.createParty(accountId, config, meta, connectionMeta);

        res.json(party);
    } catch (error) {
        LoggerService.log('error', `Create party error: ${error.message}`);
        res.json({});
    }
});

router.post("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/join", async (req, res) => {
    try {
        const { partyId, accountId } = req.params;
        const meta = req.body.meta || {};
        const connectionMeta = req.body.connection?.meta || {};

        const party = PartyManager.joinParty(partyId, accountId, meta, connectionMeta);

        if (!party) {
            return sendError(res, Errors.Party.partyNotFound(partyId));
        }

        res.json(party);
    } catch (error) {
        LoggerService.log('error', `Join party error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete("/party/api/v1/Fortnite/parties/:partyId/members/:accountId", async (req, res) => {
    try {
        const { partyId, accountId } = req.params;
        PartyManager.leaveParty(partyId, accountId);
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Leave party error: ${error.message}`);
        res.status(204).end();
    }
});

router.patch("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/meta", async (req, res) => {
    try {
        const { partyId, accountId } = req.params;
        const meta = req.body;

        PartyManager.updateMemberMeta(partyId, accountId, meta);
        
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Update member meta error: ${error.message}`);
        res.status(204).end();
    }
});

router.patch("/party/api/v1/Fortnite/parties/:partyId", async (req, res) => {
    try {
        const { partyId } = req.params;
        const config = req.body.config || {};

        PartyManager.updatePartyConfig(partyId, config);
        
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Update party error: ${error.message}`);
        res.status(204).end();
    }
});

router.delete("/party/api/v1/Fortnite/parties/:partyId", async (req, res) => {
    try {
        const { partyId } = req.params;
        PartyManager.deleteParty(partyId);
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Delete party error: ${error.message}`);
        res.status(204).end();
    }
});

router.all("/party/api/v1/Fortnite/parties/*", async (req, res) => {
    res.status(204).end();
});

module.exports = router;
