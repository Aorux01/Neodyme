const crypto = require('crypto');
const LoggerService = require('../service/logger/logger-service');

class PartyManager {
    static parties = new Map();
    static memberToParty = new Map();

    static createParty(accountId, config = {}, meta = {}, connectionMeta = {}) {
        const partyId = crypto.randomBytes(16).toString('hex');
        const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

        const party = {
            id: partyId,
            created_at: now,
            updated_at: now,
            config: {
                type: "DEFAULT",
                joinability: config.joinability || "OPEN",
                discoverability: "ALL",
                sub_type: "default",
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
                    connected_at: now,
                    updated_at: now,
                    yield_leadership: false,
                    meta: connectionMeta
                }],
                revision: 0,
                updated_at: now,
                joined_at: now,
                role: "CAPTAIN"
            }],
            applicants: [],
            meta: {},
            invites: [],
            revision: 0,
            intentions: []
        };

        this.parties.set(partyId, party);
        this.memberToParty.set(accountId, partyId);

        LoggerService.log('debug', `Party created: ${partyId} by ${accountId}`);
        return party;
    }

    static getParty(partyId) {
        return this.parties.get(partyId);
    }

    static getPartyByMember(accountId) {
        const partyId = this.memberToParty.get(accountId);
        if (!partyId) return null;
        return this.parties.get(partyId);
    }

    static joinParty(partyId, accountId, meta = {}, connectionMeta = {}) {
        const party = this.parties.get(partyId);
        if (!party) return null;

        if (party.members.length >= party.config.max_size) {
            return null;
        }

        const existingPartyId = this.memberToParty.get(accountId);
        if (existingPartyId) {
            this.leaveParty(existingPartyId, accountId);
        }

        const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

        const member = {
            account_id: accountId,
            meta: meta,
            connections: [{
                id: `${accountId}@prod`,
                connected_at: now,
                updated_at: now,
                yield_leadership: false,
                meta: connectionMeta
            }],
            revision: 0,
            updated_at: now,
            joined_at: now,
            role: "MEMBER"
        };

        party.members.push(member);
        party.updated_at = now;
        party.revision++;

        this.memberToParty.set(accountId, partyId);

        LoggerService.log('debug', `${accountId} joined party ${partyId}`);
        return party;
    }

    static leaveParty(partyId, accountId) {
        const party = this.parties.get(partyId);
        if (!party) return false;

        const memberIndex = party.members.findIndex(m => m.account_id === accountId);
        if (memberIndex === -1) return false;

        const wasCaptain = party.members[memberIndex].role === "CAPTAIN";

        party.members.splice(memberIndex, 1);
        this.memberToParty.delete(accountId);

        if (party.members.length === 0) {
            this.parties.delete(partyId);
            LoggerService.log('debug', `Party ${partyId} deleted (no members)`);
            return true;
        }

        if (wasCaptain && party.members.length > 0) {
            party.members[0].role = "CAPTAIN";
            LoggerService.log('debug', `${party.members[0].account_id} promoted to captain`);
        }

        party.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        party.revision++;

        LoggerService.log('debug', `${accountId} left party ${partyId}`);
        return true;
    }

    static updateMemberMeta(partyId, accountId, meta) {
        const party = this.parties.get(partyId);
        if (!party) return false;

        const member = party.members.find(m => m.account_id === accountId);
        if (!member) return false;

        member.meta = { ...member.meta, ...meta };
        member.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        member.revision++;

        party.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        party.revision++;

        return true;
    }

    static updatePartyConfig(partyId, config) {
        const party = this.parties.get(partyId);
        if (!party) return false;

        party.config = { ...party.config, ...config };
        party.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        party.revision++;

        return true;
    }

    static getUserParties(accountId) {
        const currentParty = this.getPartyByMember(accountId);
        
        return {
            current: currentParty ? [currentParty] : [],
            pending: [],
            invites: [],
            pings: []
        };
    }

    static deleteParty(partyId) {
        const party = this.parties.get(partyId);
        if (!party) return false;

        party.members.forEach(member => {
            this.memberToParty.delete(member.account_id);
        });

        this.parties.delete(partyId);
        LoggerService.log('debug', `Party ${partyId} deleted`);
        return true;
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