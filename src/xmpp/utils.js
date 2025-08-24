const crypto = require('crypto');

class XMPPUtils {
    static generateMessageId() {
        return crypto.randomUUID().replace(/-/g, '').toUpperCase();
    }

    static decodeBase64(data) {
        return Buffer.from(data, 'base64').toString('utf-8');
    }

    static encodeBase64(data) {
        return Buffer.from(data, 'utf-8').toString('base64');
    }

    static isValidJID(jid) {
        const jidRegex = /^[^@]+@[^@]+\/[^\/]+$/;
        return jidRegex.test(jid);
    }

    static parseJID(jid) {
        const parts = jid.split('@');
        if (parts.length !== 2) return null;

        const [localpart, rest] = parts;
        const domainParts = rest.split('/');
        if (domainParts.length !== 2) return null;

        const [domain, resource] = domainParts;

        return {
            localpart,
            domain,
            resource,
            bare: `${localpart}@${domain}`,
            full: jid
        };
    }

    static createPresenceStanza(from, to, type = 'available', show = null, status = null) {
        const stanza = {
            name: 'presence',
            attributes: {
                from,
                to,
                xmlns: 'jabber:client'
            },
            children: []
        };

        if (type !== 'available') {
            stanza.attributes.type = type;
        }

        if (show) {
            stanza.children.push({
                name: 'show',
                content: show
            });
        }

        if (status) {
            stanza.children.push({
                name: 'status',
                content: status
            });
        }

        return stanza;
    }

    static createMessageStanza(from, to, type, body, id = null) {
        const stanza = {
            name: 'message',
            attributes: {
                from,
                to,
                type,
                xmlns: 'jabber:client'
            },
            children: [{
                name: 'body',
                content: body
            }]
        };

        if (id) {
            stanza.attributes.id = id;
        }

        return stanza;
    }

    static parsePresenceStatus(statusContent) {
        try {
            const status = JSON.parse(statusContent);
            
            // Extract common Fortnite presence properties
            const presence = {
                Status: status.Status || '',
                bIsPlaying: status.bIsPlaying || false,
                bIsJoinable: status.bIsJoinable || false,
                bHasVoiceSupport: status.bHasVoiceSupport || false,
                SessionId: status.SessionId || '',
                Properties: status.Properties || {}
            };

            // Extract party info if present
            if (presence.Properties) {
                for (const key in presence.Properties) {
                    if (key.toLowerCase().includes('party')) {
                        const partyInfo = presence.Properties[key];
                        if (partyInfo && typeof partyInfo === 'object') {
                            presence.partyInfo = {
                                partyId: partyInfo.partyId,
                                partyTypeId: partyInfo.partyTypeId,
                                key: partyInfo.key,
                                appId: partyInfo.appId,
                                buildId: partyInfo.buildId,
                                partyFlags: partyInfo.partyFlags,
                                notAcceptingReason: partyInfo.notAcceptingReason
                            };
                        }
                    }
                }
            }

            return presence;
        } catch (error) {
            return null;
        }
    }

    static createPartyMessage(type, payload) {
        return {
            type: `com.epicgames.party.${type}`,
            payload: payload,
            timestamp: new Date().toISOString()
        };
    }

    static createFriendMessage(type, payload) {
        return {
            type: `com.epicgames.friends.${type}`,
            payload: payload,
            timestamp: new Date().toISOString()
        };
    }

    static sanitizeXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    static validateMessageBody(body, maxLength = 300) {
        if (!body || typeof body !== 'string') {
            return { valid: false, error: 'Invalid message body' };
        }

        if (body.length > maxLength) {
            return { valid: false, error: `Message exceeds maximum length of ${maxLength}` };
        }

        // Check for potential XSS or injection attempts
        const dangerousPatterns = [
            /<script/i,
            /<iframe/i,
            /javascript:/i,
            /on\w+\s*=/i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(body)) {
                return { valid: false, error: 'Message contains prohibited content' };
            }
        }

        return { valid: true };
    }

    static formatRoomName(partyId) {
        return `Party-${partyId}`.toLowerCase();
    }

    static parseRoomName(roomName) {
        const match = roomName.match(/^party-(.+)$/i);
        return match ? match[1] : null;
    }

    static isSystemMessage(messageType) {
        const systemTypes = [
            'com.epicgames.party.',
            'com.epicgames.friends.',
            'com.epicgames.presence.',
            'com.epicgames.social.'
        ];

        return systemTypes.some(prefix => messageType.startsWith(prefix));
    }

    static createErrorStanza(type, condition, text = null) {
        const stanza = {
            name: 'error',
            attributes: { type },
            children: [{
                name: condition,
                attributes: { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' }
            }]
        };

        if (text) {
            stanza.children.push({
                name: 'text',
                attributes: { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' },
                content: text
            });
        }

        return stanza;
    }

    static getRateLimitKey(accountId, action) {
        return `rateLimit:${accountId}:${action}`;
    }

    static checkRateLimit(limits, accountId, action, maxRequests = 10, windowMs = 60000) {
        const key = this.getRateLimitKey(accountId, action);
        const now = Date.now();
        
        if (!limits.has(key)) {
            limits.set(key, {
                requests: [],
                blocked: false
            });
        }

        const limit = limits.get(key);
        
        // Remove old requests outside the window
        limit.requests = limit.requests.filter(timestamp => now - timestamp < windowMs);
        
        // Check if rate limit exceeded
        if (limit.requests.length >= maxRequests) {
            limit.blocked = true;
            return false;
        }

        // Add current request
        limit.requests.push(now);
        limit.blocked = false;
        
        return true;
    }
}

module.exports = XMPPUtils;