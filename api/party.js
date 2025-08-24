const express = require('express');
const router = express.Router();
const AuthService = require('../src/services/AuthService');
const { Errors, sendError } = require('../src/errors/errors');
const Functions = require('../src/utils/functions');
const LoggerService = require("../src/utils/logger");
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();

// Party service
class PartyService {
    constructor() {
        this.parties = new Map();
        this.userParties = new Map(); // Maps user ID to party ID
    }

    createParty(leaderId, config = {}, meta = {}, joinInfo = {}) {
        const partyId = Functions.generatePartyId();
        const now = new Date().toISOString();

        const party = {
            id: partyId,
            created_at: now,
            updated_at: now,
            config: {
                type: "DEFAULT",
                joinability: "OPEN",
                discoverability: "ALL",
                sub_type: "default",
                max_size: 16,
                invite_ttl: 14400,
                intention_ttl: 60,
                ...config
            },
            members: [{
                account_id: leaderId,
                meta: joinInfo.meta || {},
                connections: [
                    {
                        id: joinInfo.connection?.id || `${leaderId}@prod.ol.epicgames.com`,
                        connected_at: now,
                        updated_at: now,
                        yield_leadership: false,
                        meta: joinInfo.connection?.meta || {}
                    }
                ],
                revision: 0,
                updated_at: now,
                joined_at: now,
                role: "CAPTAIN"
            }],
            applicants: [],
            meta: meta,
            invites: [],
            revision: 0,
            intentions: []
        };

        this.parties.set(partyId, party);
        this.userParties.set(leaderId, partyId);

        // Send XMPP notifications if available
        try {
            const xmppService = require('../src/xmpp/service').getService();
            if (xmppService) {
                xmppService.notifyPartyUpdate(partyId, {
                    type: 'PARTY_CREATED',
                    party: party
                });
            }
        } catch (error) {
            // XMPP not available
        }

        return party;
    }

    getParty(partyId) {
        return this.parties.get(partyId);
    }

    getUserParty(userId) {
        const partyId = this.userParties.get(userId);
        if (!partyId) return null;
        return this.getParty(partyId);
    }

    joinParty(partyId, userId, connection = {}) {
        const party = this.getParty(partyId);
        if (!party) return null;

        // Check if user is already in the party
        if (party.members.find(m => m.account_id === userId)) {
            return party;
        }

        // Check if party is full
        if (party.members.length >= party.config.max_size) {
            return null;
        }

        const now = new Date().toISOString();
        const member = {
            account_id: userId,
            meta: {},
            connections: [
                {
                    id: connection.id || `${userId}@prod.ol.epicgames.com`,
                    connected_at: now,
                    updated_at: now,
                    yield_leadership: false,
                    meta: connection.meta || {}
                }
            ],
            revision: 0,
            updated_at: now,
            joined_at: now,
            role: "MEMBER"
        };

        party.members.push(member);
        party.revision++;
        party.updated_at = now;

        this.userParties.set(userId, partyId);

        // Send XMPP notifications
        try {
            const xmppService = require('../src/xmpp/service').getService();
            if (xmppService) {
                xmppService.notifyPartyUpdate(partyId, {
                    type: 'MEMBER_JOINED',
                    member: member
                });
            }
        } catch (error) {
            // XMPP not available
        }

        return party;
    }

    leaveParty(partyId, userId) {
        const party = this.getParty(partyId);
        if (!party) return false;

        const memberIndex = party.members.findIndex(m => m.account_id === userId);
        if (memberIndex === -1) return false;

        const wasLeader = party.members[memberIndex].role === "CAPTAIN";
        party.members.splice(memberIndex, 1);
        party.revision++;
        party.updated_at = new Date().toISOString();

        this.userParties.delete(userId);

        // If party is empty, delete it
        if (party.members.length === 0) {
            this.parties.delete(partyId);
            return true;
        }

        // If leader left, promote someone else
        if (wasLeader && party.members.length > 0) {
            party.members[0].role = "CAPTAIN";
        }

        // Send XMPP notifications
        try {
            const xmppService = require('../src/xmpp/service').getService();
            if (xmppService) {
                xmppService.notifyPartyUpdate(partyId, {
                    type: 'MEMBER_LEFT',
                    accountId: userId
                });
            }
        } catch (error) {
            // XMPP not available
        }

        return true;
    }

    updateMemberMeta(partyId, userId, meta) {
        const party = this.getParty(partyId);
        if (!party) return null;

        const member = party.members.find(m => m.account_id === userId);
        if (!member) return null;

        member.meta = { ...member.meta, ...meta };
        member.revision++;
        member.updated_at = new Date().toISOString();
        party.revision++;
        party.updated_at = member.updated_at;

        return party;
    }

    promoteToLeader(partyId, userId, promoterId) {
        const party = this.getParty(partyId);
        if (!party) return null;

        const promoter = party.members.find(m => m.account_id === promoterId);
        if (!promoter || promoter.role !== "CAPTAIN") return null;

        const member = party.members.find(m => m.account_id === userId);
        if (!member) return null;

        promoter.role = "MEMBER";
        member.role = "CAPTAIN";
        party.revision++;
        party.updated_at = new Date().toISOString();

        return party;
    }

    kickMember(partyId, userId, kickerId) {
        const party = this.getParty(partyId);
        if (!party) return false;

        const kicker = party.members.find(m => m.account_id === kickerId);
        if (!kicker || kicker.role !== "CAPTAIN") return false;

        const success = this.leaveParty(partyId, userId);
        
        if (success) {
            // Send kick notification
            try {
                const xmppService = require('../src/xmpp/service').getService();
                if (xmppService) {
                    xmppService.kickFromParty(kickerId, userId, partyId);
                }
            } catch (error) {
                // XMPP not available
            }
        }

        return success;
    }
}

const partyService = new PartyService();

// Get user's party info
router.get('/party/api/v1/Fortnite/user/:accountId', requireAuth, async (req, res) => {
    try {
        const party = partyService.getUserParty(req.params.accountId);
        
        res.json({
            current: party ? [party] : [],
            pending: [],
            invites: [],
            pings: []
        });
    } catch (error) {
        LoggerService.log('error', `Error getting party: ${error}`);
        res.json({
            current: [],
            pending: [],
            invites: [],
            pings: []
        });
    }
});

// Create party
router.post('/party/api/v1/Fortnite/parties', requireAuth, async (req, res) => {
    try {
        const { config, meta, join_info } = req.body;
        
        if (!join_info || !join_info.connection) {
            return res.json({});
        }

        const accountId = (join_info.connection.id || "").split("@prod")[0] || req.user.account_id;
        
        // Leave current party if in one
        const currentParty = partyService.getUserParty(accountId);
        if (currentParty) {
            partyService.leaveParty(currentParty.id, accountId);
        }

        const party = partyService.createParty(accountId, config, meta, join_info);
        res.json(party);
    } catch (error) {
        LoggerService.log('error', `Error creating party: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Get party by ID
router.get('/party/api/v1/Fortnite/parties/:partyId', requireAuth, async (req, res) => {
    try {
        const party = partyService.getParty(req.params.partyId);
        
        if (!party) {
            throw Errors.Party.partyNotFound(req.params.partyId);
        }

        res.json(party);
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Join party
router.post('/party/api/v1/Fortnite/parties/:partyId/members/:accountId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const { connection, meta } = req.body;
        const party = partyService.joinParty(req.params.partyId, req.params.accountId, connection);
        
        if (!party) {
            throw Errors.Party.partyNotFound(req.params.partyId);
        }

        res.json(party);
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Leave party
router.delete('/party/api/v1/Fortnite/parties/:partyId/members/:accountId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const success = partyService.leaveParty(req.params.partyId, req.params.accountId);
        
        if (!success) {
            throw Errors.Party.memberNotFound(req.params.accountId);
        }

        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Update party member
router.patch('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/meta', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const party = partyService.updateMemberMeta(req.params.partyId, req.params.accountId, req.body);
        
        if (!party) {
            throw Errors.Party.memberNotFound(req.params.accountId);
        }

        res.json(party);
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Promote party leader
router.post('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/promote', requireAuth, async (req, res) => {
    try {
        const party = partyService.promoteToLeader(
            req.params.partyId,
            req.params.accountId,
            req.user.account_id
        );
        
        if (!party) {
            throw Errors.Party.notLeader();
        }

        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Kick party member
router.delete('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/kick', requireAuth, async (req, res) => {
    try {
        const success = partyService.kickMember(
            req.params.partyId,
            req.params.accountId,
            req.user.account_id
        );
        
        if (!success) {
            throw Errors.Party.notLeader();
        }

        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Party invites (simplified)
router.post('/party/api/v1/Fortnite/parties/:partyId/invites/:accountId', requireAuth, async (req, res) => {
    try {
        // Send invite via XMPP
        const xmppService = require('../src/xmpp/service').getService();
        if (xmppService) {
            const party = partyService.getParty(req.params.partyId);
            if (party) {
                xmppService.sendPartyInvite(req.user.account_id, req.params.accountId, {
                    partyId: req.params.partyId,
                    partyTypeId: 289,
                    partyFlags: -2024557306,
                    notAcceptingReason: 0,
                    buildId: '1:3:',
                    ...party.meta
                });
            }
        }

        res.json({
            sent_at: new Date().toISOString(),
            sent_by: req.user.account_id,
            sent_to: req.params.accountId,
            status: "SENT",
            party_id: req.params.partyId
        });
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
});

// Catch-all for other party endpoints
router.all('/party/api/v1/Fortnite/parties/*', async (req, res) => {
    res.status(204).end();
});

// Party notifications count
router.get('/party/api/v1/Fortnite/user/:accountId/notifications/undelivered/count', requireAuth, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        LoggerService.log('debug', `Party notifications count requested for ${accountId}`);
        
        res.json({
            "count": 0,
            "lastUpdated": new Date().toISOString()
        });
    } catch (error) {
        LoggerService.log('error', `Error in party notifications count: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Party notifications list
router.get('/party/api/v1/Fortnite/user/:accountId/notifications/undelivered', requireAuth, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        LoggerService.log('debug', `Party notifications requested for ${accountId}`);
        
        res.json([]);
    } catch (error) {
        LoggerService.log('error', `Error in party notifications: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;