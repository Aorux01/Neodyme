const express = require('express');
const router = express.Router();
const PartyManager = require('../../src/manager/party-manager');
const XmppService = require('../../src/service/xmpp/xmpp-service');
const VivoxTokenService = require('../../src/service/token/vivox-token-service');
const DatabaseManager = require('../../src/manager/database-manager');
const LoggerService = require('../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');

router.get('/party/api/v1/Fortnite/user/:accountId/notifications/undelivered/count', (req, res) => {
    const { pings, invites } = PartyManager.getUndeliveredCount(req.params.accountId);
    res.json({ pings, invites });
});

router.get('/party/api/v1/Fortnite/user/:accountId', (req, res) => {
    res.json(PartyManager.getUserParties(req.params.accountId));
});

router.get('/party/api/v1/Fortnite/parties/:partyId', async (req, res) => {
    try {
        const party = await PartyManager.getParty(req.params.partyId);
        if (!party) return sendError(res, Errors.Party.partyNotFound(req.params.partyId));
        res.json(party);
    } catch (error) {
        LoggerService.log('error', `Get party error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/party/api/v1/Fortnite/parties', async (req, res) => {
    try {
        if (!req.body.join_info?.connection) return res.json({});

        const accountId      = (req.body.join_info.connection.id || '').split('@prod')[0];
        const config         = req.body.config || {};
        const meta           = req.body.join_info.meta || {};
        const connectionMeta = req.body.join_info.connection.meta || {};

        const party = await PartyManager.createParty(accountId, config, meta, connectionMeta);
        res.json(party);
    } catch (error) {
        LoggerService.log('error', `Create party error: ${error.message}`);
        res.json({});
    }
});

router.post('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/join', async (req, res) => {
    try {
        const { partyId, accountId } = req.params;
        const meta           = req.body.meta || {};
        const connectionMeta = req.body.connection?.meta || {};
        const connectionId   = req.body.connection?.id || `${accountId}@prod.ol.epicgames.com`;
        const yieldLeadership = req.body.connection?.yield_leadership || false;

        const existing = await PartyManager.getPartyByMember(accountId);
        if (existing?.id === partyId) {
            return res.json({ status: 'JOINED', party_id: partyId });
        }

        const party = await PartyManager.joinParty(partyId, accountId, meta, connectionMeta);
        if (!party) return sendError(res, Errors.Party.partyNotFound(partyId));

        if (yieldLeadership) {
            const oldCaptain = party.members.find(m => m.account_id !== accountId && m.role === 'CAPTAIN');
            if (oldCaptain) oldCaptain.role = 'MEMBER';
            const newMember = party.members.find(m => m.account_id === accountId);
            if (newMember) newMember.role = 'CAPTAIN';
        }

        const captain = party.members.find(m => m.role === 'CAPTAIN') || party.members[0];
        const member  = party.members.find(m => m.account_id === accountId);

        const rsaKey = party.meta['Default:RawSquadAssignments_j'] ? 'Default:RawSquadAssignments_j' : 'RawSquadAssignments_j';
        let rsa = null;
        if (party.meta[rsaKey]) {
            try {
                rsa = JSON.parse(party.meta[rsaKey]);
                rsa.RawSquadAssignments.push({
                    memberId: accountId,
                    absoluteMemberIdx: party.members.length - 1
                });
                party.meta[rsaKey] = JSON.stringify(rsa);
            } catch (_) { rsa = null; }
        }

        res.json({ status: 'JOINED', party_id: partyId });

        party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
            account_dn: meta['urn:epic:member:dn_s'] || connectionMeta['urn:epic:member:dn_s'] || accountId,
            account_id: accountId,
            connection: {
                connected_at: PartyManager.now(),
                id: connectionId,
                meta: connectionMeta,
                updated_at: PartyManager.now()
            },
            joined_at: member?.joined_at || PartyManager.now(),
            member_state_updated: meta,
            ns: 'Fortnite',
            party_id: partyId,
            revision: 0,
            sent: PartyManager.now(),
            type: 'com.epicgames.social.party.notification.v0.MEMBER_JOINED',
            updated_at: PartyManager.now()
        }));

        if (rsa) {
            party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
                captain_id: captain.account_id,
                created_at: party.created_at,
                invite_ttl_seconds: 14400,
                max_number_of_members: party.config.max_size || 16,
                ns: 'Fortnite',
                party_id: partyId,
                party_privacy_type: party.config.joinability,
                party_state_overriden: {},
                party_state_removed: [],
                party_state_updated: { [rsaKey]: JSON.stringify(rsa) },
                party_sub_type: party.meta['urn:epic:cfg:party-type-id_s'] || '',
                party_type: 'DEFAULT',
                revision: party.revision,
                sent: PartyManager.now(),
                type: 'com.epicgames.social.party.notification.v0.PARTY_UPDATED',
                updated_at: PartyManager.now()
            }));
        }
    } catch (error) {
        LoggerService.log('error', `Join party error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/party/api/v1/Fortnite/parties/:partyId/members/:accountId', async (req, res) => {
    try {
        const { partyId, accountId } = req.params;
        const party = await PartyManager.getParty(partyId);

        if (party) {
            party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
                account_id: accountId,
                member_state_update: {},
                ns: 'Fortnite',
                party_id: partyId,
                revision: party.revision || 0,
                sent: PartyManager.now(),
                type: 'com.epicgames.social.party.notification.v0.MEMBER_LEFT'
            }));
        }

        await PartyManager.leaveParty(partyId, accountId);
        res.status(204).end();

        const updatedParty = await PartyManager.getParty(partyId);
        if (updatedParty) {
            const captain = updatedParty.members.find(m => m.role === 'CAPTAIN');
            const rsaKey = updatedParty.meta['Default:RawSquadAssignments_j'] ? 'Default:RawSquadAssignments_j' : 'RawSquadAssignments_j';
            let rsa = null;
            if (updatedParty.meta[rsaKey]) {
                try {
                    rsa = JSON.parse(updatedParty.meta[rsaKey]);
                    const idx = rsa.RawSquadAssignments.findIndex(a => a.memberId === accountId);
                    if (idx !== -1) rsa.RawSquadAssignments.splice(idx, 1);
                    updatedParty.meta[rsaKey] = JSON.stringify(rsa);
                } catch (_) { rsa = null; }
            }

            if (captain) {
                updatedParty.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
                    captain_id: captain.account_id,
                    created_at: updatedParty.created_at,
                    invite_ttl_seconds: 14400,
                    max_number_of_members: updatedParty.config.max_size || 16,
                    ns: 'Fortnite',
                    party_id: partyId,
                    party_privacy_type: updatedParty.config.joinability,
                    party_state_overriden: {},
                    party_state_removed: [],
                    party_state_updated: rsa ? { [rsaKey]: JSON.stringify(rsa) } : {},
                    party_sub_type: updatedParty.meta['urn:epic:cfg:party-type-id_s'] || '',
                    party_type: 'DEFAULT',
                    revision: updatedParty.revision,
                    sent: PartyManager.now(),
                    type: 'com.epicgames.social.party.notification.v0.PARTY_UPDATED',
                    updated_at: PartyManager.now()
                }));
            }
        }
    } catch (error) {
        LoggerService.log('error', `Leave party error: ${error.message}`);
        res.status(204).end();
    }
});

router.patch('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/meta', async (req, res) => {
    try {
        const { partyId, accountId } = req.params;
        const updates   = req.body.update || {};
        const deletions = req.body.delete || [];

        const result = await PartyManager.updateMemberMetaDelta(partyId, accountId, updates, deletions);
        res.status(204).end();

        if (result) {
            const { member, party } = result;
            party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
                account_id: accountId,
                account_dn: member.meta['urn:epic:member:dn_s'] || accountId,
                member_state_updated: updates,
                member_state_removed: deletions,
                member_state_overridden: {},
                party_id: partyId,
                updated_at: PartyManager.now(),
                sent: PartyManager.now(),
                revision: member.revision,
                ns: 'Fortnite',
                type: 'com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED'
            }));
        }
    } catch (error) {
        LoggerService.log('error', `Update member meta error: ${error.message}`);
        res.status(204).end();
    }
});

router.patch('/party/api/v1/Fortnite/parties/:partyId', async (req, res) => {
    try {
        const { partyId } = req.params;
        const configUpdates  = req.body.config || {};
        const metaUpdates    = req.body.meta?.update || {};
        const metaDeletions  = req.body.meta?.delete || [];
        const revision       = req.body.revision ?? null;

        const party = await PartyManager.updateParty(partyId, configUpdates, metaUpdates, metaDeletions, revision);
        res.status(204).end();

        if (party) {
            const captain = party.members.find(m => m.role === 'CAPTAIN');
            party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
                captain_id: captain?.account_id || '',
                created_at: party.created_at,
                invite_ttl_seconds: 14400,
                max_number_of_members: party.config.max_size || 16,
                ns: 'Fortnite',
                party_id: partyId,
                party_privacy_type: party.config.joinability,
                party_state_overriden: {},
                party_state_removed: metaDeletions,
                party_state_updated: metaUpdates,
                party_sub_type: party.meta['urn:epic:cfg:party-type-id_s'] || '',
                party_type: 'DEFAULT',
                revision: party.revision,
                sent: PartyManager.now(),
                type: 'com.epicgames.social.party.notification.v0.PARTY_UPDATED',
                updated_at: PartyManager.now()
            }));
        }
    } catch (error) {
        LoggerService.log('error', `Update party error: ${error.message}`);
        res.status(204).end();
    }
});

router.post('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/promote', async (req, res) => {
    try {
        const { partyId, accountId: newCaptainId } = req.params;
        const partyBefore = await PartyManager.getParty(partyId);
        if (!partyBefore) return sendError(res, Errors.Party.partyNotFound(partyId));

        const currentCaptain = partyBefore.members.find(m => m.role === 'CAPTAIN');
        const party = await PartyManager.promoteToCaptain(partyId, currentCaptain?.account_id, newCaptainId);
        res.status(204).end();

        if (party) {
            party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
                account_id: newCaptainId,
                member_state_update: {},
                ns: 'Fortnite',
                party_id: partyId,
                revision: party.revision || 0,
                sent: PartyManager.now(),
                type: 'com.epicgames.social.party.notification.v0.MEMBER_NEW_CAPTAIN'
            }));
        }
    } catch (error) {
        LoggerService.log('error', `Promote error: ${error.message}`);
        res.status(204).end();
    }
});

router.post('/party/api/v1/Fortnite/user/:accountId/pings/:pingerId', async (req, res) => {
    try {
        const { accountId: recipientId, pingerId } = req.params;
        const meta = req.body?.meta || {};

        const ping = PartyManager.addPing(pingerId, recipientId, meta);
        res.json(ping);

        let pingerDn = pingerId;
        try {
            const account = await DatabaseManager.getAccount(pingerId);
            if (account) pingerDn = account.displayName;
        } catch (_) {}

        XmppService.sendMessageToId(recipientId, {
            expires: ping.expires_at,
            meta,
            ns: 'Fortnite',
            pinger_dn: pingerDn,
            pinger_id: pingerId,
            sent: ping.sent_at,
            type: 'com.epicgames.social.party.notification.v0.PING'
        });
    } catch (error) {
        LoggerService.log('error', `Send ping error: ${error.message}`);
        res.status(204).end();
    }
});

router.delete('/party/api/v1/Fortnite/user/:accountId/pings/:pingerId', (req, res) => {
    PartyManager.removePing(req.params.pingerId, req.params.accountId);
    res.status(204).end();
});

router.get('/party/api/v1/Fortnite/user/:accountId/pings/:pingerId/parties', async (req, res) => {
    try {
        const { accountId: recipientId, pingerId } = req.params;
        const pings = PartyManager.getPingsForUser(recipientId).filter(p => p.sent_by === pingerId);

        const effectivePingerId = pings.length > 0 ? pings[0].sent_by : pingerId;
        const pingerParty = await PartyManager.getPartyByMember(effectivePingerId);

        res.json(pingerParty ? [pingerParty] : []);
    } catch (error) {
        LoggerService.log('error', `Get ping parties error: ${error.message}`);
        res.json([]);
    }
});

router.post('/party/api/v1/Fortnite/user/:accountId/pings/:pingerId/join', async (req, res) => {
    try {
        const { accountId, pingerId } = req.params;
        const meta           = req.body.meta || {};
        const connectionMeta = req.body.connection?.meta || {};
        const connectionId   = req.body.connection?.id || `${accountId}@prod.ol.epicgames.com`;

        const pingerParty = await PartyManager.getPartyByMember(pingerId);
        if (!pingerParty) return sendError(res, Errors.Party.partyNotFound('unknown'));

        const partyId = pingerParty.id;

        if (pingerParty.members.find(m => m.account_id === accountId)) {
            return res.json({ status: 'JOINED', party_id: partyId });
        }

        const party = await PartyManager.joinParty(partyId, accountId, meta, connectionMeta);
        if (!party) return sendError(res, Errors.Party.partyNotFound(partyId));

        const captain = party.members.find(m => m.role === 'CAPTAIN') || party.members[0];
        const member  = party.members.find(m => m.account_id === accountId);

        res.json({ status: 'JOINED', party_id: partyId });

        party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
            account_dn: meta['urn:epic:member:dn_s'] || connectionMeta['urn:epic:member:dn_s'] || accountId,
            account_id: accountId,
            connection: {
                connected_at: PartyManager.now(),
                id: connectionId,
                meta: connectionMeta,
                updated_at: PartyManager.now()
            },
            joined_at: member?.joined_at || PartyManager.now(),
            member_state_updated: meta,
            ns: 'Fortnite',
            party_id: partyId,
            revision: 0,
            sent: PartyManager.now(),
            type: 'com.epicgames.social.party.notification.v0.MEMBER_JOINED',
            updated_at: PartyManager.now()
        }));

        party.members.forEach(m => XmppService.sendMessageToId(m.account_id, {
            captain_id: captain.account_id,
            created_at: party.created_at,
            invite_ttl_seconds: 14400,
            max_number_of_members: party.config.max_size || 16,
            ns: 'Fortnite',
            party_id: partyId,
            party_privacy_type: party.config.joinability,
            party_state_overriden: {},
            party_state_removed: [],
            party_state_updated: {},
            party_sub_type: party.meta['urn:epic:cfg:party-type-id_s'] || '',
            party_type: 'DEFAULT',
            revision: party.revision,
            sent: PartyManager.now(),
            type: 'com.epicgames.social.party.notification.v0.PARTY_UPDATED',
            updated_at: PartyManager.now()
        }));
    } catch (error) {
        LoggerService.log('error', `Join via ping error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/party/api/v1/Fortnite/parties/:partyId/invites/:accountId', async (req, res) => {
    try {
        const { partyId, accountId: recipientId } = req.params;
        const meta     = req.body || {};
        const sendPing = req.query.sendPing === 'true';

        const party = await PartyManager.getParty(partyId);
        if (!party) return sendError(res, Errors.Party.partyNotFound(partyId));

        const inviter = party.members.find(m => m.role === 'CAPTAIN') || party.members[0];
        if (!inviter) return res.status(204).end();

        const invite = await PartyManager.addInvite(partyId, inviter.account_id, recipientId, meta);
        res.status(204).end();

        XmppService.sendMessageToId(recipientId, {
            expires: invite.expires_at,
            meta,
            ns: 'Fortnite',
            party_id: partyId,
            inviter_dn: inviter.meta['urn:epic:member:dn_s'] || inviter.account_id,
            inviter_id: inviter.account_id,
            invitee_id: recipientId,
            members_count: party.members.length,
            sent_at: invite.sent_at,
            updated_at: invite.updated_at,
            sent: PartyManager.now(),
            type: 'com.epicgames.social.party.notification.v0.INITIAL_INVITE'
        });

        if (sendPing) {
            const ping = PartyManager.addPing(inviter.account_id, recipientId, meta);
            XmppService.sendMessageToId(recipientId, {
                expires: ping.expires_at,
                meta: typeof meta === 'object' ? meta : {},
                ns: 'Fortnite',
                pinger_dn: inviter.meta['urn:epic:member:dn_s'] || inviter.account_id,
                pinger_id: inviter.account_id,
                sent: ping.sent_at,
                type: 'com.epicgames.social.party.notification.v0.PING'
            });
        }
    } catch (error) {
        LoggerService.log('error', `Send invite error: ${error.message}`);
        res.status(204).end();
    }
});

router.post([
    '/party/api/v1/Fortnite/parties/:partyId/invites/:accountId/decline',
    '/party/api/v1/Fortnite/parties/:partyId/invites/:accountId/*/decline'
], async (req, res) => {
    try {
        const { partyId, accountId: recipientId } = req.params;
        const party = await PartyManager.getParty(partyId);
        if (!party) return sendError(res, Errors.Party.partyNotFound(partyId));

        const invite = await PartyManager.removeInvite(partyId, recipientId);
        res.status(204).end();

        if (invite) {
            const inviter = party.members.find(m => m.account_id === invite.sent_by);
            if (inviter) {
                XmppService.sendMessageToId(invite.sent_by, {
                    expires: invite.expires_at,
                    meta: req.body || {},
                    ns: 'Fortnite',
                    party_id: partyId,
                    inviter_dn: inviter.meta['urn:epic:member:dn_s'] || invite.sent_by,
                    inviter_id: invite.sent_by,
                    invitee_id: recipientId,
                    sent_at: invite.sent_at,
                    updated_at: invite.updated_at,
                    sent: PartyManager.now(),
                    type: 'com.epicgames.social.party.notification.v0.INVITE_CANCELLED'
                });
            }
        }
    } catch (error) {
        LoggerService.log('error', `Decline invite error: ${error.message}`);
        res.status(204).end();
    }
});

router.post('/party/api/v1/Fortnite/members/:accountId/intentions/:senderId', async (req, res) => {
    try {
        const { accountId: recipientId, senderId } = req.params;

        const party = await PartyManager.getPartyByMember(senderId);
        if (!party) return sendError(res, Errors.Party.partyNotFound('unknown'));

        const sender  = party.members.find(m => m.account_id === senderId);
        const captain = party.members.find(m => m.role === 'CAPTAIN');

        const intention = await PartyManager.addIntention(party.id, senderId, recipientId, req.body || {});
        res.json(intention);

        let friendIds = [];
        try {
            const friendsData = await DatabaseManager.getFriends(recipientId);
            friendIds = party.members
                .filter(m => friendsData.friends.some(f => f.accountId === m.account_id))
                .map(m => m.account_id);
        } catch (_) {}

        XmppService.sendMessageToId(recipientId, {
            expires_at: intention.expires_at,
            requester_id: senderId,
            requester_dn: sender?.meta['urn:epic:member:dn_s'] || senderId,
            requester_pl: captain?.account_id || senderId,
            requester_pl_dn: captain?.meta['urn:epic:member:dn_s'] || senderId,
            requestee_id: recipientId,
            meta: req.body || {},
            sent_at: PartyManager.now(),
            updated_at: PartyManager.now(),
            friends_ids: friendIds,
            members_count: party.members.length,
            party_id: party.id,
            ns: 'Fortnite',
            sent: PartyManager.now(),
            type: 'com.epicgames.social.party.notification.v0.INITIAL_INTENTION'
        });
    } catch (error) {
        LoggerService.log('error', `Intention error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/party/api/v1/Fortnite/parties/:partyId/members/:accountId/conferences/connection', (req, res) => {
    const { partyId, accountId } = req.params;
    const { token, channel_uri, user_uri } = VivoxTokenService.generate(accountId, partyId);
    res.json({
        providers: {
            vivox: {
                authorization_token: token,
                channel_uri,
                user_uri
            }
        }
    });
});

router.delete('/party/api/v1/Fortnite/parties/:partyId', async (req, res) => {
    await PartyManager.deleteParty(req.params.partyId);
    res.status(204).end();
});

router.get('/party/api/v1/Fortnite/user/:accountId/settings/privacy', (req, res) => {
    res.json({ current: [], pending: [], invites: [], pings: [] });
});

router.all('/party/api/v1/Fortnite/*', (_, res) => {
    res.status(204).end();
});

module.exports = router;
