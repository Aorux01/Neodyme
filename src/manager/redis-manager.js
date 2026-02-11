const Redis = require('ioredis');
const ConfigManager = require('./config-manager');
const LoggerService = require('../service/logger/logger-service');

class RedisManager {
    static client = null;
    static connected = false;
    static enabled = false;

    static async initialize() {
        this.enabled = ConfigManager.get('redisEnabled');

        if (!this.enabled) {
            LoggerService.log('info', '[Redis] Redis is disabled in configuration');
            return;
        }

        try {
            const config = {
                host: ConfigManager.get('redisHost') || '127.0.0.1',
                port: ConfigManager.get('redisPort') || 6379,
                password: ConfigManager.get('redisPassword') || undefined,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
                enableReadyCheck: true,
                lazyConnect: true
            };

            this.client = new Redis(config);

            this.client.on('connect', () => {
                LoggerService.log('success', '[Redis] Connected to Redis server');
                this.connected = true;
            });

            this.client.on('error', (error) => {
                LoggerService.log('error', `[Redis] Error: ${error.message}`);
                this.connected = false;
            });

            this.client.on('close', () => {
                LoggerService.log('warn', '[Redis] Connection closed');
                this.connected = false;
            });

            await this.client.connect();
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to initialize: ${error.message}`);
            this.enabled = false;
        }
    }

    static isEnabled() {
        return this.enabled && this.connected;
    }

    // XMPP Session Management
    static async setXMPPSession(accountId, sessionData, ttl = 86400) {
        if (!this.isEnabled()) return false;

        try {
            const key = `xmpp:session:${accountId}`;
            await this.client.setex(key, ttl, JSON.stringify(sessionData));
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to set XMPP session: ${error.message}`);
            return false;
        }
    }

    static async getXMPPSession(accountId) {
        if (!this.isEnabled()) return null;

        try {
            const key = `xmpp:session:${accountId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to get XMPP session: ${error.message}`);
            return null;
        }
    }

    static async deleteXMPPSession(accountId) {
        if (!this.isEnabled()) return false;

        try {
            const key = `xmpp:session:${accountId}`;
            await this.client.del(key);
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to delete XMPP session: ${error.message}`);
            return false;
        }
    }

    static async getAllXMPPSessions() {
        if (!this.isEnabled()) return [];

        try {
            const keys = await this.client.keys('xmpp:session:*');
            const sessions = [];

            for (const key of keys) {
                const data = await this.client.get(key);
                if (data) {
                    sessions.push(JSON.parse(data));
                }
            }

            return sessions;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to get all XMPP sessions: ${error.message}`);
            return [];
        }
    }

    // Party Management
    static async setParty(partyId, partyData, ttl = 86400) {
        if (!this.isEnabled()) return false;

        try {
            const key = `party:${partyId}`;
            await this.client.setex(key, ttl, JSON.stringify(partyData));
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to set party: ${error.message}`);
            return false;
        }
    }

    static async getParty(partyId) {
        if (!this.isEnabled()) return null;

        try {
            const key = `party:${partyId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to get party: ${error.message}`);
            return null;
        }
    }

    static async deleteParty(partyId) {
        if (!this.isEnabled()) return false;

        try {
            const key = `party:${partyId}`;
            await this.client.del(key);
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to delete party: ${error.message}`);
            return false;
        }
    }

    static async setMemberToParty(accountId, partyId, ttl = 86400) {
        if (!this.isEnabled()) return false;

        try {
            const key = `party:member:${accountId}`;
            await this.client.setex(key, ttl, partyId);
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to set member to party: ${error.message}`);
            return false;
        }
    }

    static async getMemberParty(accountId) {
        if (!this.isEnabled()) return null;

        try {
            const key = `party:member:${accountId}`;
            return await this.client.get(key);
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to get member party: ${error.message}`);
            return null;
        }
    }

    static async deleteMemberParty(accountId) {
        if (!this.isEnabled()) return false;

        try {
            const key = `party:member:${accountId}`;
            await this.client.del(key);
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to delete member party: ${error.message}`);
            return false;
        }
    }

    // Generic Key-Value Operations
    static async set(key, value, ttl = null) {
        if (!this.isEnabled()) return false;

        try {
            if (ttl) {
                await this.client.setex(key, ttl, typeof value === 'object' ? JSON.stringify(value) : value);
            } else {
                await this.client.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
            }
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to set key: ${error.message}`);
            return false;
        }
    }

    static async get(key, isJSON = false) {
        if (!this.isEnabled()) return null;

        try {
            const data = await this.client.get(key);
            return (data && isJSON) ? JSON.parse(data) : data;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to get key: ${error.message}`);
            return null;
        }
    }

    static async delete(key) {
        if (!this.isEnabled()) return false;

        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to delete key: ${error.message}`);
            return false;
        }
    }

    static async exists(key) {
        if (!this.isEnabled()) return false;

        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            LoggerService.log('error', `[Redis] Failed to check key existence: ${error.message}`);
            return false;
        }
    }

    static async disconnect() {
        if (this.client && this.connected) {
            await this.client.quit();
            LoggerService.log('info', '[Redis] Disconnected from Redis server');
        }
    }
}

module.exports = RedisManager;
