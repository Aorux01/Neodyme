const crypto = require('crypto');
const LoggerService = require('../service/logger/logger-service');
const RedisManager = require('./redis-manager');

class PartyManager {
    static parties = new Map();
    static memberToParty = new Map();
    static pings = [];
    static initialized = false;

    static async initialize() {
        if (this.initialized) return;
        this.initialized = true;
        LoggerService.log('info', `PartyManager initialized (storage: ${RedisManager.isEnabled() ? 'Redis' : 'Memory'})`);
    }

    static now() {
        return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    static async saveParty(party) {
        if (RedisManager.isEnabled()) {
            await RedisManager.setParty(party.id, party);
        } else {
            this.parties.set(party.id, party);
        }
    }

    static async saveMemberParty(accountId, partyId) {
        if (RedisManager.isEnabled()) {
            await RedisManager.setMemberToParty(accountId, partyId);
        } else {
            this.memberToParty.set(accountId, partyId);
        }
    }

    static async deleteMemberParty(accountId) {
        if (RedisManager.isEnabled()) {
            await RedisManager.deleteMemberParty(accountId);
        } else {
            this.memberToParty.delete(accountId);
        }
    }

    static async deletePartyRecord(partyId) {
        if (RedisManager.isEnabled()) {
            await RedisManager.deleteParty(partyId);
        } else {
            this.parties.delete(partyId);
        }
    }
    static async createParty(accountId, config = {}, meta = {}, connectionMeta = {}) {
        const partyId = crypto.randomBytes(16).toString('hex');
        const ts = this.now();

        const party = {
            id: partyId,
            created_at: ts,
            updated_at: ts,
            config: {
                type: 'DEFAULT',
                joinability: config.joinability || 'OPEN',
                discoverability: 'ALL',
                sub_type: 'default',
                max_size: config.max_size || 16,
                invite_ttl: 14400,
                intention_ttl: 60,
                ...config
            },
            members: [{
                account_id: accountId,
                meta: meta,
                connections: [{
                    id: `${accountId}@prod`,
                    connected_at: ts,
                    updated_at: ts,
                    yield_leadership: false,
                    meta: connectionMeta
                }],
                revision: 0,
                updated_at: ts,
                joined_at: ts,
                role: 'CAPTAIN'
            }],
            applicants: [],
            meta: {},
            invites: [],
            revision: 0,
            intentions: []
        };

        await this.saveParty(party);
        await this.saveMemberParty(accountId, partyId);

        LoggerService.log('debug', `Party created: ${partyId} by ${accountId}`);
        return party;
    }

    static async getParty(partyId) {
        if (RedisManager.isEnabled()) {
            return await RedisManager.getParty(partyId);
        }
        return this.parties.get(partyId) || null;
    }

    static async getPartyByMember(accountId) {
        if (RedisManager.isEnabled()) {
            const partyId = await RedisManager.getMemberParty(accountId);
            if (!partyId) return null;
            return await RedisManager.getParty(partyId);
        }
        const partyId = this.memberToParty.get(accountId);
        if (!partyId) return null;
        return this.parties.get(partyId) || null;
    }

    static async joinParty(partyId, accountId, meta = {}, connectionMeta = {}) {
        const party = await this.getParty(partyId);
        if (!party) return null;

        if (party.members.length >= party.config.max_size) return null;

        const existingPartyId = RedisManager.isEnabled()
            ? await RedisManager.getMemberParty(accountId)
            : this.memberToParty.get(accountId);

        if (existingPartyId && existingPartyId !== partyId) {
            await this.leaveParty(existingPartyId, accountId);
        }

        const ts = this.now();
        const member = {
            account_id: accountId,
            meta: meta,
            connections: [{
                id: `${accountId}@prod`,
                connected_at: ts,
                updated_at: ts,
                yield_leadership: false,
                meta: connectionMeta
            }],
            revision: 0,
            updated_at: ts,
            joined_at: ts,
            role: 'MEMBER'
        };

        party.members.push(member);
        party.updated_at = ts;
        party.revision++;

        await this.saveMemberParty(accountId, partyId);
        await this.saveParty(party);

        LoggerService.log('debug', `${accountId} joined party ${partyId}`);
        return party;
    }

    static async leaveParty(partyId, accountId) {
        const party = await this.getParty(partyId);
        if (!party) return false;

        const memberIndex = party.members.findIndex(m => m.account_id === accountId);
        if (memberIndex === -1) return false;

        const wasCaptain = party.members[memberIndex].role === 'CAPTAIN';
        party.members.splice(memberIndex, 1);
        await this.deleteMemberParty(accountId);

        if (party.members.length === 0) {
            await this.deletePartyRecord(partyId);
            LoggerService.log('debug', `Party ${partyId} deleted (no members)`);
            return true;
        }

        if (wasCaptain) {
            party.members[0].role = 'CAPTAIN';
            LoggerService.log('debug', `${party.members[0].account_id} auto-promoted to captain`);
        }

        party.updated_at = this.now();
        party.revision++;
        await this.saveParty(party);

        LoggerService.log('debug', `${accountId} left party ${partyId}`);
        return true;
    }

    static async deleteParty(partyId) {
        const party = await this.getParty(partyId);
        if (!party) return false;

        for (const m of party.members) {
            await this.deleteMemberParty(m.account_id);
        }
        await this.deletePartyRecord(partyId);

        LoggerService.log('debug', `Party ${partyId} deleted`);
        return true;
    }

    static async updateMemberMeta(partyId, accountId, meta) {
        const party = await this.getParty(partyId);
        if (!party) return false;
        const member = party.members.find(m => m.account_id === accountId);
        if (!member) return false;

        Object.assign(member.meta, meta);
        member.updated_at = this.now();
        member.revision++;
        party.updated_at = this.now();
        party.revision++;

        await this.saveParty(party);
        return true;
    }

    static async updateMemberMetaDelta(partyId, accountId, updates = {}, deletions = []) {
        const party = await this.getParty(partyId);
        if (!party) return null;
        const member = party.members.find(m => m.account_id === accountId);
        if (!member) return null;

        if (Array.isArray(deletions)) {
            deletions.forEach(key => delete member.meta[key]);
        }
        Object.assign(member.meta, updates);

        member.updated_at = this.now();
        member.revision++;
        party.updated_at = this.now();
        party.revision++;

        await this.saveParty(party);
        return { member, party };
    }

    static async updatePartyConfig(partyId, config) {
        const party = await this.getParty(partyId);
        if (!party) return false;

        Object.assign(party.config, config);
        party.updated_at = this.now();
        party.revision++;

        await this.saveParty(party);
        return true;
    }

    static async updateParty(partyId, configUpdates = {}, metaUpdates = {}, metaDeletions = [], revision = null) {
        const party = await this.getParty(partyId);
        if (!party) return null;

        Object.assign(party.config, configUpdates);

        if (Array.isArray(metaDeletions)) {
            metaDeletions.forEach(key => delete party.meta[key]);
        }
        Object.assign(party.meta, metaUpdates);

        if (revision !== null) party.revision = revision;
        party.updated_at = this.now();

        await this.saveParty(party);
        return party;
    }

    static async promoteToCaptain(partyId, requesterId, newCaptainId) {
        const party = await this.getParty(partyId);
        if (!party) return null;

        const requester = party.members.find(m => m.account_id === requesterId);
        if (!requester || requester.role !== 'CAPTAIN') return null;

        const newCaptain = party.members.find(m => m.account_id === newCaptainId);
        if (!newCaptain) return null;

        requester.role = 'MEMBER';
        newCaptain.role = 'CAPTAIN';
        party.updated_at = this.now();
        party.revision++;

        await this.saveParty(party);
        LoggerService.log('debug', `${newCaptainId} promoted to captain in party ${partyId}`);
        return party;
    }

    static addPing(senderId, recipientId, meta = {}) {
        const idx = this.pings.findIndex(p => p.sent_by === senderId && p.sent_to === recipientId);
        if (idx !== -1) this.pings.splice(idx, 1);

        const now = new Date();
        const expires = new Date(now.getTime() + 3600_000);
        const ping = {
            sent_by: senderId,
            sent_to: recipientId,
            sent_at: now.toISOString(),
            expires_at: expires.toISOString(),
            meta: meta || {}
        };
        this.pings.push(ping);
        return ping;
    }

    static removePing(senderId, recipientId) {
        const idx = this.pings.findIndex(p => p.sent_by === senderId && p.sent_to === recipientId);
        if (idx !== -1) this.pings.splice(idx, 1);
    }

    static getPingsForUser(accountId) {
        return this.pings.filter(p => p.sent_to === accountId);
    }

    static async addInvite(partyId, inviterId, recipientId, meta = {}) {
        const party = await this.getParty(partyId);
        if (!party) return null;

        const idx = party.invites.findIndex(i => i.sent_by === inviterId && i.sent_to === recipientId);
        if (idx !== -1) party.invites.splice(idx, 1);

        const now = new Date();
        const expires = new Date(now.getTime() + 3600_000);
        const invite = {
            party_id: partyId,
            sent_by: inviterId,
            meta,
            sent_to: recipientId,
            sent_at: now.toISOString(),
            updated_at: now.toISOString(),
            expires_at: expires.toISOString(),
            status: 'SENT'
        };
        party.invites.push(invite);
        party.updated_at = this.now();

        await this.saveParty(party);
        return invite;
    }

    static async removeInvite(partyId, recipientId) {
        const party = await this.getParty(partyId);
        if (!party) return null;

        const idx = party.invites.findIndex(i => i.sent_to === recipientId);
        if (idx === -1) return null;

        const [invite] = party.invites.splice(idx, 1);
        await this.saveParty(party);
        return invite;
    }

    static getInvitesForUser(accountId) {
        const result = [];
        this.parties.forEach(party => {
            party.invites
                .filter(i => i.sent_to === accountId)
                .forEach(i => result.push(i));
        });
        return result;
    }

    static async addIntention(partyId, senderId, recipientId, meta = {}) {
        const party = await this.getParty(partyId);
        if (!party) return null;

        if (!party.intentions) party.intentions = [];

        const now = new Date();
        const expires = new Date(now.getTime() + 3600_000);
        const intention = {
            requester_id: senderId,
            requestee_id: recipientId,
            meta,
            expires_at: expires.toISOString(),
            sent_at: now.toISOString()
        };
        party.intentions.push(intention);

        await this.saveParty(party);
        return intention;
    }

    static getUserParties(accountId) {
        const partyId = this.memberToParty.get(accountId);
        const party = partyId ? (this.parties.get(partyId) || null) : null;
        return {
            current: party ? [party] : [],
            pending: [],
            invites: this.getInvitesForUser(accountId),
            pings: this.getPingsForUser(accountId)
        };
    }

    static getUndeliveredCount(accountId) {
        const pings = this.pings.filter(p => p.sent_to === accountId).length;
        let invites = 0;
        this.parties.forEach(party => {
            invites += party.invites.filter(i => i.sent_to === accountId).length;
        });
        return { pings, invites };
    }

    static getAllParties() {
        return Array.from(this.parties.values());
    }

    static getStats() {
        return {
            totalParties: this.parties.size,
            totalMembers: this.memberToParty.size,
            averageMembersPerParty: this.parties.size > 0
                ? (this.memberToParty.size / this.parties.size).toFixed(2)
                : 0
        };
    }
}

module.exports = PartyManager;
