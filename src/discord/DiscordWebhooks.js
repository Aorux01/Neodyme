const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../utils/logger');

class DiscordWebhooks {
    constructor(config) {
        this.config = config || {};
        this.webhooks = this.config.webhooks || {};
        this.isEnabled = this.config.enabled && Object.keys(this.webhooks).length > 0;
    }

    async sendWebhook(webhookType, embed, username = null) {
        if (!this.isEnabled || !this.webhooks[webhookType]?.enabled) return false;

        try {
            const webhook = this.webhooks[webhookType];
            const fetch = require('node-fetch');

            const payload = {
                username: username || webhook.username || 'Neodyme Server',
                avatar_url: webhook.avatar || 'https://cdn.discordapp.com/icons/your-server/icon.png',
                embeds: Array.isArray(embed) ? embed : [embed]
            };

            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
            }

            return true;
        } catch (error) {
            LoggerService.log('error', `Discord webhook error (${webhookType}):`, error.message);
            return false;
        }
    }

    // Server status webhooks
    async notifyServerStart(serverInfo = {}) {
        const embed = {
            title: '🟢 Neodyme Server Online',
            description: 'Server has started successfully and is ready for players!',
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '🕐 Started At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '🌍 Host', value: serverInfo.host || '0.0.0.0', inline: true },
                { name: '🔌 Port', value: (serverInfo.port || 3551).toString(), inline: true },
                { name: '📦 Version', value: serverInfo.version || '1.0.0', inline: true },
                { name: '🔧 Debug Mode', value: serverInfo.debug ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '🎮 Game Ready', value: '✅ Yes', inline: true }
            ],
            footer: {
                text: 'Neodyme Backend',
                icon_url: 'https://cdn.discordapp.com/emojis/game_controller.png'
            }
        };

        return await this.sendWebhook('serverStatus', embed);
    }

    async notifyServerShutdown(uptimeSeconds = 0) {
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;

        const embed = {
            title: '🔴 Neodyme Server Offline',
            description: 'Server is shutting down for maintenance or updates',
            color: 0xff0000,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '🕐 Shutdown At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '⏰ Total Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                { name: '📊 Status', value: 'Graceful shutdown', inline: true }
            ],
            footer: {
                text: 'Server will be back shortly'
            }
        };

        return await this.sendWebhook('serverStatus', embed);
    }

    async notifyMaintenanceMode(enabled, message = null) {
        const embed = {
            title: enabled ? '🔧 Maintenance Mode Enabled' : '✅ Maintenance Mode Disabled',
            description: enabled 
                ? (message || 'Server is under maintenance. Please try again later.')
                : 'Server is back online and ready for players!',
            color: enabled ? 0xffa500 : 0x00ff00,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '🔧 Status', value: enabled ? 'Under Maintenance' : 'Operational', inline: true },
                { name: '🕐 Changed At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '📢 Message', value: message || 'N/A', inline: false }
            ]
        };

        return await this.sendWebhook('serverStatus', embed);
    }

    // Player activity webhooks
    async notifyPlayerRegistration(playerData) {
        const embed = {
            title: '🎉 New Player Registered',
            description: `Welcome **${playerData.displayName}** to Neodyme!`,
            color: 0x00adee,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '👤 Username', value: playerData.displayName, inline: true },
                { name: '📧 Email', value: playerData.email, inline: true },
                { name: '🌍 Country', value: playerData.country || 'Unknown', inline: true },
                { name: '🆔 Account ID', value: playerData.accountId, inline: false },
                { name: '📅 Registered', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
            ],
            footer: {
                text: 'New member joined the community!'
            }
        };

        return await this.sendWebhook('playerActivity', embed);
    }

    async notifyPlayerLogin(playerData, loginInfo = {}) {
        const embed = {
            title: '🔑 Player Login',
            description: `**${playerData.displayName}** logged into Neodyme`,
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '👤 Player', value: playerData.displayName, inline: true },
                { name: '🌐 IP Address', value: loginInfo.ip || 'Hidden', inline: true },
                { name: '💻 Client', value: loginInfo.userAgent || 'Game Client', inline: true },
                { name: '🕐 Login Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '🎮 Platform', value: loginInfo.platform || 'PC', inline: true },
                { name: '📍 Region', value: loginInfo.region || 'Unknown', inline: true }
            ]
        };

        return await this.sendWebhook('playerActivity', embed);
    }

    async notifyPlayerBan(playerData, banInfo) {
        const embed = {
            title: '🔨 Player Banned',
            description: `**${playerData.displayName}** has been banned from Neodyme`,
            color: 0xff0000,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '👤 Player', value: playerData.displayName, inline: true },
                { name: '📧 Email', value: playerData.email, inline: true },
                { name: '🆔 Account ID', value: playerData.accountId, inline: false },
                { name: '📝 Reason', value: banInfo.reason || 'No reason provided', inline: false },
                { name: '👮 Banned By', value: banInfo.bannedBy || 'System', inline: true },
                { name: '🕐 Ban Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '⏰ Duration', value: banInfo.duration || 'Permanent', inline: true }
            ],
            footer: {
                text: 'Moderation Action Logged'
            }
        };

        return await this.sendWebhook('moderation', embed);
    }

    async notifyPlayerUnban(playerData, unbanInfo) {
        const embed = {
            title: '✅ Player Unbanned',
            description: `**${playerData.displayName}** has been unbanned from Neodyme`,
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '👤 Player', value: playerData.displayName, inline: true },
                { name: '📧 Email', value: playerData.email, inline: true },
                { name: '👮 Unbanned By', value: unbanInfo.unbannedBy || 'System', inline: true },
                { name: '🕐 Unban Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '📝 Notes', value: unbanInfo.notes || 'Appeal accepted', inline: false }
            ]
        };

        return await this.sendWebhook('moderation', embed);
    }

    // Statistics webhooks
    async sendDailyStats(stats) {
        const embed = {
            title: '📊 Daily Server Statistics',
            description: 'Here are today\'s server statistics',
            color: 0x00adee,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '👥 Total Players', value: stats.totalPlayers?.toString() || '0', inline: true },
                { name: '🆕 New Registrations', value: stats.newRegistrations?.toString() || '0', inline: true },
                { name: '🎮 Active Players', value: stats.activePlayers?.toString() || '0', inline: true },
                { name: '🏆 Matches Played', value: stats.matchesPlayed?.toString() || '0', inline: true },
                { name: '⏱️ Peak Online', value: stats.peakOnline?.toString() || '0', inline: true },
                { name: '🕐 Server Uptime', value: stats.uptime || '0h 0m', inline: true }
            ],
            footer: {
                text: 'Daily statistics generated automatically'
            }
        };

        return await this.sendWebhook('statistics', embed);
    }

    async sendWeeklyReport(report) {
        const embed = {
            title: '📈 Weekly Server Report',
            description: 'Weekly performance and activity summary',
            color: 0x9932cc,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '👥 Total Players', value: report.totalPlayers?.toString() || '0', inline: true },
                { name: '📈 Growth Rate', value: report.growthRate || '+0%', inline: true },
                { name: '🎮 Avg Daily Active', value: report.avgDailyActive?.toString() || '0', inline: true },
                { name: '🏆 Total Matches', value: report.totalMatches?.toString() || '0', inline: true },
                { name: '⚡ Avg Response Time', value: report.avgResponseTime || '0ms', inline: true },
                { name: '🔧 Maintenance Hours', value: report.maintenanceHours || '0h', inline: true },
                { name: '🚫 Moderation Actions', value: report.moderationActions?.toString() || '0', inline: true },
                { name: '🎯 Popular Game Mode', value: report.popularGameMode || 'Solo', inline: true },
                { name: '🌍 Top Region', value: report.topRegion || 'Unknown', inline: true }
            ]
        };

        return await this.sendWebhook('statistics', embed);
    }

    // Error and alert webhooks
    async sendErrorAlert(error, context = {}) {
        const embed = {
            title: '⚠️ Server Error Alert',
            description: 'An error occurred on the Neodyme server',
            color: 0xff4444,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '❌ Error Type', value: error.name || 'Unknown Error', inline: true },
                { name: '📍 Location', value: context.location || 'Unknown', inline: true },
                { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '📝 Message', value: `\`\`\`${error.message || 'No message'}\`\`\``, inline: false }
            ]
        };

        if (context.stack && context.includeStack) {
            embed.fields.push({
                name: '🔍 Stack Trace',
                value: `\`\`\`${context.stack.substring(0, 1000)}${context.stack.length > 1000 ? '...' : ''}\`\`\``,
                inline: false
            });
        }

        return await this.sendWebhook('alerts', embed);
    }

    async sendSecurityAlert(alertType, details = {}) {
        const embed = {
            title: '🚨 Security Alert',
            description: `Security event detected: **${alertType}**`,
            color: 0xff0000,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '🔒 Alert Type', value: alertType, inline: true },
                { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '📍 Source IP', value: details.ip || 'Unknown', inline: true },
                { name: '👤 User Agent', value: details.userAgent || 'Unknown', inline: false },
                { name: '📝 Details', value: details.description || 'No additional details', inline: false }
            ]
        };

        if (details.accountId) {
            embed.fields.push({ name: '🆔 Account ID', value: details.accountId, inline: true });
        }

        return await this.sendWebhook('security', embed);
    }

    // Plugin webhooks
    async sendPluginNotification(pluginName, message, type = 'info') {
        const colors = {
            info: 0x00adee,
            success: 0x00ff00,
            warning: 0xffa500,
            error: 0xff0000
        };

        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const embed = {
            title: `${icons[type]} ${pluginName} Plugin`,
            description: message,
            color: colors[type] || colors.info,
            timestamp: new Date().toISOString(),
            footer: {
                text: `Plugin: ${pluginName}`
            }
        };

        return await this.sendWebhook('plugins', embed);
    }

    // Utility methods
    async testWebhook(webhookType) {
        const embed = {
            title: '🧪 Webhook Test',
            description: `This is a test message for the **${webhookType}** webhook`,
            color: 0x00adee,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '📡 Webhook Type', value: webhookType, inline: true },
                { name: '🕐 Test Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '✅ Status', value: 'Working correctly', inline: true }
            ]
        };

        const result = await this.sendWebhook(webhookType, embed, 'Neodyme Test');
        
        if (result) {
            LoggerService.log('success', `Webhook test successful for: ${webhookType}`);
        } else {
            LoggerService.log('error', `Webhook test failed for: ${webhookType}`);
        }

        return result;
    }

    async testAllWebhooks() {
        const results = {};
        
        for (const webhookType of Object.keys(this.webhooks)) {
            if (this.webhooks[webhookType]?.enabled) {
                results[webhookType] = await this.testWebhook(webhookType);
                
                // Add small delay between tests
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    // Configuration management
    static async loadConfig(configPath = null) {
        try {
            const defaultPath = path.join(process.cwd(), 'discord_webhooks_config.json');
            const filePath = configPath || defaultPath;
            
            const configData = await fs.readFile(filePath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            LoggerService.log('warn', 'Discord webhooks config not found, using defaults');
            return DiscordWebhooks.getDefaultConfig();
        }
    }

    static getDefaultConfig() {
        return {
            enabled: false,
            webhooks: {
                serverStatus: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Server',
                    avatar: 'https://your-domain.com/neodyme-icon.png'
                },
                playerActivity: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Players',
                    avatar: 'https://your-domain.com/player-icon.png'
                },
                moderation: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Moderation',
                    avatar: 'https://your-domain.com/mod-icon.png'
                },
                statistics: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Stats',
                    avatar: 'https://your-domain.com/stats-icon.png'
                },
                alerts: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Alerts',
                    avatar: 'https://your-domain.com/alert-icon.png'
                },
                security: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Security',
                    avatar: 'https://your-domain.com/security-icon.png'
                },
                plugins: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Plugins',
                    avatar: 'https://your-domain.com/plugin-icon.png'
                }
            },
            settings: {
                rateLimitEnabled: true,
                maxWebhooksPerMinute: 10,
                retryFailedWebhooks: true,
                maxRetries: 3,
                retryDelay: 5000
            }
        };
    }

    static async saveConfig(config, configPath = null) {
        try {
            const defaultPath = path.join(process.cwd(), 'discord_webhooks_config.json');
            const filePath = configPath || defaultPath;
            
            await fs.writeFile(filePath, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            LoggerService.log('error', 'Failed to save Discord webhooks config:', error.message);
            return false;
        }
    }
}

module.exports = DiscordWebhooks;