const fs = require('fs').promises;
const path = require('path');
const DiscordBot = require('./DiscordBot');
const LoggerService = require('../utils/logger');

class DiscordManager {
    constructor(serverInstance) {
        this.server = serverInstance;
        this.bot = null;
        this.config = null;
        this.isEnabled = false;
    }

    async initialize() {
        try {
            await this.loadConfig();
            
            if (!this.config.enabled) {
                LoggerService.log('info', 'Discord integration is disabled');
                return false;
            }

            if (!this.config.token) {
                LoggerService.log('warn', 'Discord bot token not configured - Discord features disabled');
                return false;
            }

            this.bot = new DiscordBot(this.config);
            const success = await this.bot.initialize();
            
            if (success) {
                this.isEnabled = true;
                LoggerService.log('success', 'Discord integration initialized successfully');
                
                // Add bot reference to server for plugin access
                this.server.discordBot = this.bot;
                
                return true;
            } else {
                LoggerService.log('error', 'Failed to initialize Discord bot');
                return false;
            }
        } catch (error) {
            LoggerService.log('error', 'Discord manager initialization error:', error.message);
            return false;
        }
    }

    async loadConfig() {
        try {
            const configPath = path.join(process.cwd(), 'discord_config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            this.config = JSON.parse(configData);
        } catch (error) {
            LoggerService.log('warn', 'Discord config not found, using defaults');
            this.config = this.getDefaultConfig();
            await this.saveConfig();
        }
    }

    async saveConfig() {
        try {
            const configPath = path.join(process.cwd(), 'discord_config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            LoggerService.log('error', 'Failed to save Discord config:', error.message);
        }
    }

    getDefaultConfig() {
        return {
            enabled: false,
            token: '',
            clientId: '',
            guildId: '',
            channels: {
                general: '',
                admin: '',
                logs: '',
                status: ''
            },
            adminRoles: ['Owner', 'Admin', 'Moderator'],
            adminUsers: [],
            features: {
                playerRegistration: true,
                autoStatusUpdates: true,
                playerStatistics: true,
                adminCommands: true,
                moderation: true,
                broadcasts: true,
                maintenanceMode: true,
                exchangeCodes: true,
                profileManagement: true
            },
            statusUpdate: {
                enabled: true,
                intervalMinutes: 5,
                showPlayerCount: true,
                activityType: 'WATCHING'
            },
            webhooks: {
                serverStatus: {
                    enabled: false,
                    url: '',
                    username: 'Neodyme Server'
                }
            }
        };
    }

    // Server event handlers
    async onServerStart() {
        if (this.isEnabled && this.bot) {
            await this.bot.notifyServerStart();
        }
    }

    async onServerShutdown() {
        if (this.isEnabled && this.bot) {
            await this.bot.notifyServerShutdown();
            await this.bot.shutdown();
        }
    }

    async onPlayerJoin(accountData) {
        if (this.isEnabled && this.bot && this.config.webhooks?.playerActions?.enabled) {
            const embed = {
                title: '👋 Player Joined',
                description: `**${accountData.displayName}** joined the server`,
                color: 0x00ff00,
                timestamp: new Date().toISOString(),
                fields: [
                    { name: '🆔 Account ID', value: accountData.accountId, inline: true },
                    { name: '📧 Email', value: accountData.email, inline: true },
                    { name: '🕐 Joined At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
                ]
            };
            
            await this.bot.sendWebhookMessage(this.config.webhooks.playerActions, embed);
        }
    }

    async onPlayerRegistration(accountData) {
        if (this.isEnabled && this.bot && this.config.webhooks?.playerActions?.enabled) {
            const embed = {
                title: '🎉 New Registration',
                description: `**${accountData.displayName}** created a new account`,
                color: 0x00adee,
                timestamp: new Date().toISOString(),
                fields: [
                    { name: '👤 Username', value: accountData.displayName, inline: true },
                    { name: '📧 Email', value: accountData.email, inline: true },
                    { name: '🌍 Country', value: accountData.country || 'Unknown', inline: true }
                ]
            };
            
            await this.bot.sendWebhookMessage(this.config.webhooks.playerActions, embed);
        }
    }

    async onPlayerBan(accountData, reason, adminUser) {
        if (this.isEnabled && this.bot) {
            // Log to admin channel
            await this.bot.logToAdminChannel(
                `🔨 **Player Banned**\n` +
                `**Player:** ${accountData.displayName} (${accountData.email})\n` +
                `**Reason:** ${reason}\n` +
                `**Admin:** ${adminUser || 'System'}`
            );

            // Send webhook if enabled
            if (this.config.webhooks?.playerActions?.enabled) {
                const embed = {
                    title: '🔨 Player Banned',
                    description: `**${accountData.displayName}** was banned from the server`,
                    color: 0xff0000,
                    timestamp: new Date().toISOString(),
                    fields: [
                        { name: '👤 Player', value: accountData.displayName, inline: true },
                        { name: '📧 Email', value: accountData.email, inline: true },
                        { name: '📝 Reason', value: reason, inline: false },
                        { name: '👮 Banned By', value: adminUser || 'System', inline: true }
                    ]
                };
                
                await this.bot.sendWebhookMessage(this.config.webhooks.playerActions, embed);
            }
        }
    }

    // Plugin integration
    registerPluginCommands(plugin) {
        if (!this.isEnabled || !this.bot || !plugin.commands) return;

        plugin.commands.forEach(command => {
            this.bot.commands.set(command.name, {
                ...command,
                plugin: plugin.name,
                execute: async (interaction) => {
                    try {
                        await plugin.handleDiscordCommand(interaction);
                    } catch (error) {
                        LoggerService.log('error', `Plugin ${plugin.name} command error:`, error.message);
                        
                        const errorMessage = `❌ An error occurred while executing this command from the ${plugin.name} plugin.`;
                        
                        if (interaction.replied || interaction.deferred) {
                            await interaction.followUp({ content: errorMessage, ephemeral: true });
                        } else {
                            await interaction.reply({ content: errorMessage, ephemeral: true });
                        }
                    }
                }
            });
        });

        LoggerService.log('success', `Registered ${plugin.commands.length} Discord commands for plugin: ${plugin.name}`);
    }

    // Utility methods
    getBot() {
        return this.bot;
    }

    isReady() {
        return this.isEnabled && this.bot && this.bot.isReady;
    }

    getConfig() {
        return this.config;
    }

    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveConfig();
        
        if (this.bot) {
            this.bot.config = this.config;
        }
    }
}

module.exports = DiscordManager;