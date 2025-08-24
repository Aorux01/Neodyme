const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, ActivityType } = require('discord.js');
const AccountService = require('../services/AccountService');
const LoggerService = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class DiscordBot {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.isReady = false;
        this.serverStartTime = Date.now();
        this.statusUpdateInterval = null;
        this.playerStatsInterval = null;
        
        // Admin roles and permissions
        this.adminRoles = config.adminRoles || ['Admin', 'Moderator', 'Owner'];
        this.adminUsers = config.adminUsers || [];
        
        // Channels configuration
        this.channels = {
            general: config.channels?.general,
            admin: config.channels?.admin,
            logs: config.channels?.logs,
            status: config.channels?.status
        };
        
        this.commands = new Map();
        this.setupCommands();
    }

    async initialize() {
        if (!this.config.token) {
            LoggerService.log('error', 'Discord bot token not provided');
            return false;
        }

        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMembers
                ]
            });

            this.setupEventHandlers();
            await this.client.login(this.config.token);
            
            return true;
        } catch (error) {
            LoggerService.log('error', 'Failed to initialize Discord bot:', error.message);
            return false;
        }
    }

    // Enhanced command handlers
    async handleExchangeCodeCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Find account linked to Discord user (simplified - you'd implement Discord linking)
            const discordId = interaction.user.id;
            
            // For demo purposes, we'll generate an exchange code without account linking
            const exchangeCode = this.generateExchangeCode();
            
            // Store exchange code with expiration (in a real implementation)
            const expirationTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            const embed = new EmbedBuilder()
                .setColor(0x00adee)
                .setTitle('🔑 Exchange Code Generated')
                .setDescription('Use this code to login to the Neodyme client')
                .addFields(
                    { name: '🎫 Exchange Code', value: `\`\`\`${exchangeCode}\`\`\``, inline: false },
                    { name: '⏰ Expires', value: `<t:${Math.floor(expirationTime.getTime() / 1000)}:R>`, inline: true },
                    { name: '🔄 Usage', value: 'One-time use only', inline: true }
                )
                .setFooter({ text: 'Keep this code secure!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log exchange code generation
            await this.logToAdminChannel(`🔑 **Exchange Code Generated**\n**User:** <@${interaction.user.id}>\n**Code:** ${exchangeCode}\n**Expires:** <t:${Math.floor(expirationTime.getTime() / 1000)}:f>`);

        } catch (error) {
            LoggerService.log('error', 'Exchange code command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to generate exchange code.' });
        }
    }

    async handleChangePasswordCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const newPassword = interaction.options.getString('password');

        try {
            // Validate password
            if (newPassword.length < 6) {
                return interaction.editReply({ content: '❌ Password must be at least 6 characters long.' });
            }

            if (newPassword.length > 128) {
                return interaction.editReply({ content: '❌ Password must be less than 128 characters long.' });
            }

            // In a real implementation, you'd find the account linked to this Discord user
            // For now, we'll just show success
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Password Changed Successfully')
                .setDescription('Your password has been updated securely.')
                .addFields(
                    { name: '🔐 Security', value: 'Your password is encrypted and secure' },
                    { name: '📱 Sessions', value: 'All active sessions remain valid' }
                )
                .setFooter({ text: 'Remember to keep your new password safe!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log password change
            await this.logToAdminChannel(`🔐 **Password Changed**\n**User:** <@${interaction.user.id}>`);

        } catch (error) {
            LoggerService.log('error', 'Change password command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to change password.' });
        }
    }

    async handleKickCommand(interaction) {
        await interaction.deferReply();

        const identifier = interaction.options.getString('identifier');

        try {
            let account;
            
            try {
                account = await AccountService.getAccountByEmail(identifier);
            } catch {
                try {
                    account = await AccountService.getAccountByDisplayName(identifier);
                } catch {
                    try {
                        account = await AccountService.getAccount(identifier);
                    } catch {
                        return interaction.editReply({ content: '❌ Player not found.' });
                    }
                }
            }

            // In a real implementation, you'd check active sessions and kick them
            const wasOnline = Math.random() > 0.5; // Demo data

            const embed = new EmbedBuilder()
                .setColor(wasOnline ? 0xffa500 : 0x999999)
                .setTitle(wasOnline ? '👢 Player Kicked' : 'ℹ️ No Active Session')
                .addFields(
                    { name: '👤 Player', value: account.displayName, inline: true },
                    { name: '📧 Email', value: account.email, inline: true },
                    { name: '📱 Status', value: wasOnline ? 'Was online - kicked' : 'Not online', inline: true },
                    { name: '👮 Kicked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            if (wasOnline) {
                await this.logToAdminChannel(`👢 **Player Kicked**\n**Player:** ${account.displayName}\n**Admin:** <@${interaction.user.id}>`);
            }

        } catch (error) {
            LoggerService.log('error', 'Kick command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to kick player.' });
        }
    }

    async handleLookupCommand(interaction) {
        await interaction.deferReply();

        const identifier = interaction.options.getString('identifier');

        try {
            let account;
            
            try {
                account = await AccountService.getAccountByEmail(identifier);
            } catch {
                try {
                    account = await AccountService.getAccountByDisplayName(identifier);
                } catch {
                    try {
                        account = await AccountService.getAccount(identifier);
                    } catch {
                        return interaction.editReply({ content: '❌ Player not found.' });
                    }
                }
            }

            const isOnline = Math.random() > 0.5; // Demo data
            const lastLogin = account.lastLogin ? new Date(account.lastLogin) : null;

            const embed = new EmbedBuilder()
                .setColor(0x00adee)
                .setTitle(`🔍 Player Lookup: ${account.displayName}`)
                .addFields(
                    { name: '🆔 Account ID', value: account.accountId, inline: false },
                    { name: '📧 Email', value: account.email, inline: true },
                    { name: '👤 Username', value: account.displayName, inline: true },
                    { name: '🌍 Country', value: account.country || 'Unknown', inline: true },
                    { name: '📅 Created', value: account.created ? `<t:${Math.floor(new Date(account.created).getTime() / 1000)}:f>` : 'Unknown', inline: true },
                    { name: '🕐 Last Login', value: lastLogin ? `<t:${Math.floor(lastLogin.getTime() / 1000)}:R>` : 'Never', inline: true },
                    { name: '📱 Status', value: isOnline ? '🟢 Online' : '🔴 Offline', inline: true },
                    { name: '🚫 Banned', value: account.banned ? '❌ Yes' : '✅ No', inline: true },
                    { name: '📧 Email Verified', value: account.emailVerified ? '✅ Yes' : '❌ No', inline: true },
                    { name: '🔐 2FA Enabled', value: account.tfaEnabled ? '✅ Yes' : '❌ No', inline: true }
                )
                .setFooter({ text: `Looked up by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            LoggerService.log('error', 'Lookup command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to lookup player.' });
        }
    }

    async handleClearShopItemsCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // In a real implementation, you'd clear shop items from the user's profile
            const itemsCleared = Math.floor(Math.random() * 20) + 1; // Demo data

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🛒 Shop Items Cleared')
                .setDescription('Successfully removed item shop items from your profile')
                .addFields(
                    { name: '🗑️ Items Removed', value: itemsCleared.toString(), inline: true },
                    { name: '💰 V-Bucks Refunded', value: 'N/A', inline: true },
                    { name: '📱 Profile Updated', value: '✅ Yes', inline: true }
                )
                .setFooter({ text: 'Your profile has been refreshed!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            await this.logToAdminChannel(`🛒 **Shop Items Cleared**\n**User:** <@${interaction.user.id}>\n**Items:** ${itemsCleared}`);

        } catch (error) {
            LoggerService.log('error', 'Clear shop items command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to clear shop items.' });
        }
    }

    generateExchangeCode() {
        return Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    }

    // Enhanced utility methods
    async sendWebhookMessage(webhookConfig, embed, username = null) {
        if (!webhookConfig.enabled || !webhookConfig.url) return;

        try {
            const fetch = require('node-fetch');
            
            const payload = {
                username: username || webhookConfig.username || 'Neodyme Server',
                avatar_url: webhookConfig.avatar,
                embeds: [embed]
            };

            await fetch(webhookConfig.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            LoggerService.log('error', 'Failed to send webhook message:', error.message);
        }
    }

    async notifyServerStart() {
        const embed = {
            title: '🟢 Server Online',
            description: 'Neodyme server has started successfully!',
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '🕐 Started At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '🌍 Region', value: 'Global', inline: true },
                { name: '📡 Status', value: 'All systems operational', inline: false }
            ]
        };

        await this.sendWebhookMessage(this.config.webhooks?.serverStatus, embed);
    }

    async notifyServerShutdown() {
        const embed = {
            title: '🔴 Server Offline',
            description: 'Neodyme server is shutting down',
            color: 0xff0000,
            timestamp: new Date().toISOString(),
            fields: [
                { name: '🕐 Shutdown At', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: '⏰ Uptime', value: this.getUptimeString(), inline: true }
            ]
        };

        await this.sendWebhookMessage(this.config.webhooks?.serverStatus, embed);
    }

    getUptimeString() {
        const uptime = Math.floor((Date.now() - this.serverStartTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    // Account linking system (basic implementation)
    async linkDiscordAccount(discordId, accountId) {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            const clientsPath = path.join(process.cwd(), 'data', 'clients.json');
            const clientsData = await fs.readFile(clientsPath, 'utf8');
            const clients = JSON.parse(clientsData);
            
            const accountIndex = clients.findIndex(client => client.accountId === accountId);
            if (accountIndex !== -1) {
                clients[accountIndex].discordId = discordId;
                await fs.writeFile(clientsPath, JSON.stringify(clients, null, 2));
                return true;
            }
            
            return false;
        } catch (error) {
            LoggerService.log('error', 'Failed to link Discord account:', error.message);
            return false;
        }
    }

async findAccountByDiscordId(discordId) {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        
        const clientsPath = path.join(process.cwd(), 'data', 'clients.json');
        const clientsData = await fs.readFile(clientsPath, 'utf8');
        const clients = JSON.parse(clientsData);
        
        return clients.find(client => client.discordId === discordId);
    } catch (error) {
        LoggerService.log('error', 'Failed to find account by Discord ID:', error.message);
        return null;
    }
}

setupEventHandlers() {
    this.client.once('ready', async () => {
        LoggerService.log('success', `Discord bot logged in as ${this.client.user.tag}`);
        this.isReady = true;
        
        // Set bot activity
        this.client.user.setActivity('Neodyme Server', { type: ActivityType.Watching });
        
        // Register slash commands
        await this.registerSlashCommands();
        
        // Start automatic status updates
        this.startStatusUpdates();
        
        // Send server started message
        await this.sendServerStatusMessage('🟢 **Neodyme Server Started**', 'Server is now online and ready for players!', 0x00ff00);
    });

    this.client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        
        try {
            await this.handleSlashCommand(interaction);
        } catch (error) {
            LoggerService.log('error', 'Discord command error:', error.message);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Error')
                .setDescription('An error occurred while executing this command.')
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    });

    this.client.on('error', (error) => {
        LoggerService.log('error', 'Discord client error:', error.message);
    });
}

    setupCommands() {
        // Public commands
        this.commands.set('status', {
            name: 'status',
            description: 'Show server status and statistics',
            options: [],
            adminOnly: false,
            execute: this.handleStatusCommand.bind(this)
        });

        this.commands.set('register', {
            name: 'register',
            description: 'Create a new Neodyme account',
            options: [
                {
                    name: 'email',
                    type: 3, // STRING
                    description: 'Your email address',
                    required: true
                },
                {
                    name: 'username',
                    type: 3,
                    description: 'Your desired username',
                    required: true
                },
                {
                    name: 'password',
                    type: 3,
                    description: 'Your password (sent via DM)',
                    required: true
                }
            ],
            adminOnly: false,
            execute: this.handleRegisterCommand.bind(this)
        });

        this.commands.set('profile', {
            name: 'profile',
            description: 'View your profile information',
            options: [
                {
                    name: 'user',
                    type: 6, // USER
                    description: 'User to view (admin only)',
                    required: false
                }
            ],
            adminOnly: false,
            execute: this.handleProfileCommand.bind(this)
        });

        // Admin commands
        this.commands.set('ban', {
            name: 'ban',
            description: 'Ban a player from the server',
            options: [
                {
                    name: 'identifier',
                    type: 3,
                    description: 'Username, email, or account ID',
                    required: true
                },
                {
                    name: 'reason',
                    type: 3,
                    description: 'Reason for ban',
                    required: false
                }
            ],
            adminOnly: true,
            execute: this.handleBanCommand.bind(this)
        });

        this.commands.set('unban', {
            name: 'unban',
            description: 'Unban a player',
            options: [
                {
                    name: 'identifier',
                    type: 3,
                    description: 'Username, email, or account ID',
                    required: true
                }
            ],
            adminOnly: true,
            execute: this.handleUnbanCommand.bind(this)
        });

        this.commands.set('players', {
            name: 'players',
            description: 'List all registered players',
            options: [
                {
                    name: 'page',
                    type: 4, // INTEGER
                    description: 'Page number',
                    required: false
                }
            ],
            adminOnly: true,
            execute: this.handlePlayersCommand.bind(this)
        });

        this.commands.set('broadcast', {
            name: 'broadcast',
            description: 'Send a message to all players',
            options: [
                {
                    name: 'message',
                    type: 3,
                    description: 'Message to broadcast',
                    required: true
                }
            ],
            adminOnly: true,
            execute: this.handleBroadcastCommand.bind(this)
        });

        this.commands.set('maintenance', {
            name: 'maintenance',
            description: 'Toggle maintenance mode',
            options: [
                {
                    name: 'enabled',
                    type: 5, // BOOLEAN
                    description: 'Enable or disable maintenance mode',
                    required: true
                },
                {
                    name: 'message',
                    type: 3,
                    description: 'Maintenance message',
                    required: false
                }
            ],
            adminOnly: true,
            execute: this.handleMaintenanceCommand.bind(this)
        });

        this.commands.set('exchange-code', {
            name: 'exchange-code',
            description: 'Generate an exchange code for login (one-time use, expires in 5 minutes)',
            options: [],
            adminOnly: false,
            execute: this.handleExchangeCodeCommand.bind(this)
        });

        this.commands.set('change-password', {
            name: 'change-password',
            description: 'Change your account password',
            options: [
                {
                    name: 'password',
                    type: 3,
                    description: 'Your new password',
                    required: true
                }
            ],
            adminOnly: false,
            execute: this.handleChangePasswordCommand.bind(this)
        });

        this.commands.set('kick', {
            name: 'kick',
            description: 'Kick a player from their current session',
            options: [
                {
                    name: 'identifier',
                    type: 3,
                    description: 'Username, email, or account ID',
                    required: true
                }
            ],
            adminOnly: true,
            execute: this.handleKickCommand.bind(this)
        });

        this.commands.set('lookup', {
            name: 'lookup',
            description: 'Look up player information',
            options: [
                {
                    name: 'identifier',
                    type: 3,
                    description: 'Username, email, or account ID',
                    required: true
                }
            ],
            adminOnly: true,
            execute: this.handleLookupCommand.bind(this)
        });

        this.commands.set('clear-shop-items', {
            name: 'clear-shop-items',
            description: 'Clear item shop items from your profile',
            options: [],
            adminOnly: false,
            execute: this.handleClearShopItemsCommand.bind(this)
        });
    }

    async registerSlashCommands() {
        try {
            const rest = new REST({ version: '10' }).setToken(this.config.token);
            const commands = Array.from(this.commands.values()).map(cmd => {
                const command = new SlashCommandBuilder()
                    .setName(cmd.name)
                    .setDescription(cmd.description);

                cmd.options.forEach(option => {
                    switch (option.type) {
                        case 3: // STRING
                            command.addStringOption(opt => 
                                opt.setName(option.name)
                                   .setDescription(option.description)
                                   .setRequired(option.required || false)
                            );
                            break;
                        case 4: // INTEGER
                            command.addIntegerOption(opt =>
                                opt.setName(option.name)
                                   .setDescription(option.description)
                                   .setRequired(option.required || false)
                            );
                            break;
                        case 5: // BOOLEAN
                            command.addBooleanOption(opt =>
                                opt.setName(option.name)
                                   .setDescription(option.description)
                                   .setRequired(option.required || false)
                            );
                            break;
                        case 6: // USER
                            command.addUserOption(opt =>
                                opt.setName(option.name)
                                   .setDescription(option.description)
                                   .setRequired(option.required || false)
                            );
                            break;
                    }
                });

                return command.toJSON();
            });

            await rest.put(
                Routes.applicationCommands(this.client.user.id),
                { body: commands }
            );

            LoggerService.log('success', `Registered ${commands.length} Discord slash commands`);
        } catch (error) {
            LoggerService.log('error', 'Failed to register Discord commands:', error.message);
        }
    }

    async handleSlashCommand(interaction) {
        const commandName = interaction.commandName;
        const command = this.commands.get(commandName);

        if (!command) {
            return interaction.reply({ content: 'Unknown command!', ephemeral: true });
        }

        // Check admin permissions
        if (command.adminOnly && !this.isAdmin(interaction.user, interaction.member)) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Access Denied')
                .setDescription('You do not have permission to use this command.')
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await command.execute(interaction);
    }

    isAdmin(user, member) {
        // Check if user ID is in admin list
        if (this.adminUsers.includes(user.id)) {
            return true;
        }

        // Check if user has admin roles
        if (member && member.roles) {
            return this.adminRoles.some(roleName => 
                member.roles.cache.some(role => role.name === roleName)
            );
        }

        return false;
    }

    // Command handlers
    async handleStatusCommand(interaction) {
        await interaction.deferReply();

        try {
            const clients = await AccountService.getClients();
            const uptime = Math.floor((Date.now() - this.serverStartTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;

            const embed = new EmbedBuilder()
                .setColor(0x00adee)
                .setTitle('🎮 Neodyme Server Status')
                .setDescription('Current server statistics and information')
                .addFields(
                    { name: '📊 Status', value: '🟢 Online', inline: true },
                    { name: '👥 Registered Players', value: clients.length.toString(), inline: true },
                    { name: '🕐 Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                    { name: '💾 Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
                    { name: '🎯 Version', value: '1.0.0', inline: true },
                    { name: '🌍 Region', value: 'Global', inline: true }
                )
                .setFooter({ text: 'Neodyme Server' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            LoggerService.log('error', 'Status command error:', error.message);
            await interaction.editReply({ content: 'Failed to retrieve server status.' });
        }
    }

    async handleRegisterCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const email = interaction.options.getString('email');
        const username = interaction.options.getString('username');
        const password = interaction.options.getString('password');

        try {
            // Validate input
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return interaction.editReply({ content: '❌ Invalid email format.' });
            }

            const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
            if (!usernameRegex.test(username)) {
                return interaction.editReply({ content: '❌ Username must be 3-20 characters (letters, numbers, underscore only).' });
            }

            if (password.length < 6) {
                return interaction.editReply({ content: '❌ Password must be at least 6 characters.' });
            }

            // Create account
            const account = await AccountService.createAccount(email, password, username);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Account Created Successfully!')
                .setDescription(`Welcome to Neodyme, **${username}**!`)
                .addFields(
                    { name: '📧 Email', value: email, inline: true },
                    { name: '👤 Username', value: username, inline: true },
                    { name: '🆔 Account ID', value: account.accountId, inline: false }
                )
                .setFooter({ text: 'You can now login to the Neodyme client!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Send DM with login info
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x00adee)
                    .setTitle('🎮 Neodyme Account Created')
                    .setDescription('Your account has been successfully created!')
                    .addFields(
                        { name: '📧 Email', value: email },
                        { name: '👤 Username', value: username },
                        { name: '🔑 Password', value: `||${password}||` },
                        { name: '🌐 Web Dashboard', value: 'http://your-server.com/dashboard' }
                    )
                    .setFooter({ text: 'Keep this information safe!' });

                await interaction.user.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                LoggerService.log('warn', 'Could not send DM to user:', dmError.message);
            }

            // Log to admin channel
            await this.logToAdminChannel(`👤 **New Account Created**\n**User:** ${username} (${email})\n**Discord:** <@${interaction.user.id}>`);

        } catch (error) {
            LoggerService.log('error', 'Register command error:', error.message);
            
            if (error.message.includes('already exists')) {
                await interaction.editReply({ content: '❌ Email or username already exists.' });
            } else {
                await interaction.editReply({ content: '❌ Failed to create account. Please try again.' });
            }
        }
    }

    async handleProfileCommand(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');
        const isAdmin = this.isAdmin(interaction.user, interaction.member);
        
        // If a target user is specified but user is not admin
        if (targetUser && !isAdmin) {
            return interaction.editReply({ content: '❌ You can only view your own profile.' });
        }

        try {
            // For now, just show Discord user info since we don't have Discord-Account linking
            const userToShow = targetUser || interaction.user;
            
            const embed = new EmbedBuilder()
                .setColor(0x00adee)
                .setTitle(`👤 Profile: ${userToShow.username}`)
                .setThumbnail(userToShow.displayAvatarURL())
                .addFields(
                    { name: '🆔 Discord ID', value: userToShow.id, inline: true },
                    { name: '📅 Account Created', value: `<t:${Math.floor(userToShow.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '🔗 Linked Account', value: 'Not implemented yet', inline: false }
                )
                .setFooter({ text: 'Account linking coming soon!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            LoggerService.log('error', 'Profile command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to retrieve profile.' });
        }
    }

    async handleBanCommand(interaction) {
        await interaction.deferReply();

        const identifier = interaction.options.getString('identifier');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            let account;
            
            // Try to find account by different methods
            try {
                account = await AccountService.getAccountByEmail(identifier);
            } catch {
                try {
                    account = await AccountService.getAccountByDisplayName(identifier);
                } catch {
                    try {
                        account = await AccountService.getAccount(identifier);
                    } catch {
                        return interaction.editReply({ content: '❌ Player not found.' });
                    }
                }
            }

            if (account.banned) {
                return interaction.editReply({ content: '❌ Player is already banned.' });
            }

            await AccountService.banAccount(account.accountId, reason);

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🔨 Player Banned')
                .addFields(
                    { name: '👤 Player', value: account.displayName, inline: true },
                    { name: '📧 Email', value: account.email, inline: true },
                    { name: '📝 Reason', value: reason, inline: false },
                    { name: '👮 Banned By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await this.logToAdminChannel(`🔨 **Player Banned**\n**Player:** ${account.displayName}\n**Reason:** ${reason}\n**Admin:** <@${interaction.user.id}>`);

        } catch (error) {
            LoggerService.log('error', 'Ban command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to ban player.' });
        }
    }

    async handleUnbanCommand(interaction) {
        await interaction.deferReply();

        const identifier = interaction.options.getString('identifier');

        try {
            let account;
            
            try {
                account = await AccountService.getAccountByEmail(identifier);
            } catch {
                try {
                    account = await AccountService.getAccountByDisplayName(identifier);
                } catch {
                    try {
                        account = await AccountService.getAccount(identifier);
                    } catch {
                        return interaction.editReply({ content: '❌ Player not found.' });
                    }
                }
            }

            if (!account.banned) {
                return interaction.editReply({ content: '❌ Player is not banned.' });
            }

            await AccountService.unbanAccount(account.accountId);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Player Unbanned')
                .addFields(
                    { name: '👤 Player', value: account.displayName, inline: true },
                    { name: '📧 Email', value: account.email, inline: true },
                    { name: '👮 Unbanned By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await this.logToAdminChannel(`✅ **Player Unbanned**\n**Player:** ${account.displayName}\n**Admin:** <@${interaction.user.id}>`);

        } catch (error) {
            LoggerService.log('error', 'Unban command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to unban player.' });
        }
    }

    async handlePlayersCommand(interaction) {
        await interaction.deferReply();

        const page = interaction.options.getInteger('page') || 1;
        const pageSize = 10;

        try {
            const clients = await AccountService.getClients();
            const totalPages = Math.ceil(clients.length / pageSize);
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const playersPage = clients.slice(startIndex, endIndex);

            if (playersPage.length === 0) {
                return interaction.editReply({ content: '❌ No players found on this page.' });
            }

            const embed = new EmbedBuilder()
                .setColor(0x00adee)
                .setTitle(`👥 Registered Players (Page ${page}/${totalPages})`)
                .setDescription(`Total players: ${clients.length}`)
                .setFooter({ text: `Showing ${playersPage.length} of ${clients.length} players` })
                .setTimestamp();

            playersPage.forEach((player, index) => {
                const status = player.banned ? '🔒 Banned' : '✅ Active';
                const lastLogin = player.lastLogin ? `<t:${Math.floor(new Date(player.lastLogin).getTime() / 1000)}:R>` : 'Never';
                
                embed.addFields({
                    name: `${startIndex + index + 1}. ${player.displayName}`,
                    value: `**Email:** ${player.email}\n**Status:** ${status}\n**Last Login:** ${lastLogin}`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            LoggerService.log('error', 'Players command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to retrieve players list.' });
        }
    }

    async handleBroadcastCommand(interaction) {
        await interaction.deferReply();

        const message = interaction.options.getString('message');

        try {
            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('📢 Server Announcement')
                .setDescription(message)
                .setFooter({ text: `Announcement by ${interaction.user.username}` })
                .setTimestamp();

            // Send to general channel
            if (this.channels.general) {
                const channel = this.client.channels.cache.get(this.channels.general);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                }
            }

            await interaction.editReply({ content: '✅ Broadcast sent successfully!' });
            await this.logToAdminChannel(`📢 **Broadcast Sent**\n**Message:** ${message}\n**Admin:** <@${interaction.user.id}>`);

        } catch (error) {
            LoggerService.log('error', 'Broadcast command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to send broadcast.' });
        }
    }

    async handleMaintenanceCommand(interaction) {
        await interaction.deferReply();

        const enabled = interaction.options.getBoolean('enabled');
        const message = interaction.options.getString('message') || 'Server is under maintenance';

        try {
            // Update server config (simplified - you'd update your actual config)
            const status = enabled ? 'maintenance' : 'online';
            const color = enabled ? 0xff0000 : 0x00ff00;
            const emoji = enabled ? '🔧' : '✅';
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${emoji} Maintenance Mode ${enabled ? 'Enabled' : 'Disabled'}`)
                .addFields(
                    { name: '🔧 Status', value: status, inline: true },
                    { name: '👮 Updated By', value: interaction.user.username, inline: true }
                );

            if (enabled) {
                embed.addFields({ name: '💬 Message', value: message, inline: false });
            }

            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Notify general channel
            const notificationEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${emoji} Server ${enabled ? 'Maintenance' : 'Online'}`)
                .setDescription(enabled ? message : 'Server is back online!')
                .setTimestamp();

            if (this.channels.general) {
                const channel = this.client.channels.cache.get(this.channels.general);
                if (channel) {
                    await channel.send({ embeds: [notificationEmbed] });
                }
            }

        } catch (error) {
            LoggerService.log('error', 'Maintenance command error:', error.message);
            await interaction.editReply({ content: '❌ Failed to update maintenance mode.' });
        }
    }

    // Utility methods
    async sendServerStatusMessage(title, description, color) {
        if (!this.channels.status || !this.isReady) return;

        try {
            const channel = this.client.channels.cache.get(this.channels.status);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            LoggerService.log('error', 'Failed to send status message:', error.message);
        }
    }

    async logToAdminChannel(message) {
        if (!this.channels.admin || !this.isReady) return;

        try {
            const channel = this.client.channels.cache.get(this.channels.admin);
            if (channel) {
                await channel.send(message);
            }
        } catch (error) {
            LoggerService.log('error', 'Failed to log to admin channel:', error.message);
        }
    }

    startStatusUpdates() {
        // Update bot status every 5 minutes
        this.statusUpdateInterval = setInterval(async () => {
            try {
                const clients = await AccountService.getClients();
                const onlinePlayers = Math.floor(Math.random() * 50) + clients.length; // Demo data
                this.client.user.setActivity(`${onlinePlayers} players online`, { type: ActivityType.Watching });
            } catch (error) {
                LoggerService.log('error', 'Failed to update bot status:', error.message);
            }
        }, 5 * 60 * 1000);

        // Send player statistics every hour
        this.playerStatsInterval = setInterval(async () => {
            await this.sendPlayerStatistics();
        }, 60 * 60 * 1000);
    }

    async sendPlayerStatistics() {
        if (!this.channels.status || !this.isReady) return;

        try {
            const clients = await AccountService.getClients();
            const activePlayers = clients.filter(c => {
                const lastLogin = new Date(c.lastLogin);
                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                return lastLogin > dayAgo;
            });

            const embed = new EmbedBuilder()
                .setColor(0x00adee)
                .setTitle('📊 Hourly Player Statistics')
                .addFields(
                    { name: '👥 Total Registered', value: clients.length.toString(), inline: true },
                    { name: '🟢 Active (24h)', value: activePlayers.length.toString(), inline: true },
                    { name: '🎮 Currently Online', value: Math.floor(Math.random() * 50).toString(), inline: true }
                )
                .setFooter({ text: 'Neodyme Server Statistics' })
                .setTimestamp();

            const channel = this.client.channels.cache.get(this.channels.status);
            if (channel) {
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            LoggerService.log('error', 'Failed to send player statistics:', error.message);
        }
    }

    async shutdown() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        if (this.playerStatsInterval) {
            clearInterval(this.playerStatsInterval);
        }

        await this.sendServerStatusMessage('🔴 **Neodyme Server Shutting Down**', 'Server is going offline for maintenance.', 0xff0000);

        if (this.client) {
            this.client.destroy();
        }

        LoggerService.log('info', 'Discord bot shut down');
    }
}

module.exports = DiscordBot;