const path = require('path');
const fs = require('fs');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');

function register(CM) {
    CM.register('/data', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        if (subCommand !== 'migrate') {
            LoggerService.log('info', `Usage: ${colors.cyan('/data migrate <json mongodb | mongodb json> [options]')}`);
            LoggerService.log('info', 'Subcommands:');
            LoggerService.log('info', `  ${colors.cyan('migrate json mongodb')}   - Migrate JSON data to MongoDB`);
            LoggerService.log('info', `  ${colors.cyan('migrate mongodb json')}   - Migrate MongoDB data to JSON`);
            LoggerService.log('info', 'Options:');
            LoggerService.log('info', `  ${colors.cyan('--dry-run')}              - Preview without writing`);
            LoggerService.log('info', `  ${colors.cyan('--confirm')}              - Skip confirmation prompt`);
            LoggerService.log('info', `  ${colors.cyan('--uri=<mongodb_uri>')}    - MongoDB URI (required if databaseType=json)`);
            LoggerService.log('info', `  ${colors.cyan('--switch')}               - Update server.properties after migration`);
            return;
        }

        const from = args[1]?.toLowerCase();
        const to   = args[2]?.toLowerCase();
        const isDryRun  = args.includes('--dry-run');
        const isConfirm = args.includes('--confirm');
        const doSwitch  = args.includes('--switch');

        const uriArg     = args.find(a => a.startsWith('--uri='));
        const providedUri = uriArg ? uriArg.slice(6).trim() : null;

        const validCombinations = [
            ['json', 'mongodb'],
            ['mongodb', 'json'],
        ];

        const isValid = validCombinations.some(([f, t]) => f === from && t === to);
        if (!isValid) {
            LoggerService.log('error', `Invalid direction. Use: ${colors.cyan('json mongodb')} or ${colors.cyan('mongodb json')}`);
            return;
        }

        const direction = `${from} → ${to}`;

        if (isDryRun) {
            LoggerService.log('info', `[DRY-RUN] Migration preview: ${colors.cyan(direction)}`);

            if (from === 'json') {
                const dataPath    = path.join(process.cwd(), 'data');
                const playersPath = path.join(dataPath, 'players');
                const clientsFile = path.join(dataPath, 'clients.json');

                if (!fs.existsSync(clientsFile)) {
                    LoggerService.log('warn', 'clients.json not found - nothing to migrate.');
                    return;
                }

                const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));
                LoggerService.log('info', `[DRY-RUN] ${colors.cyan(clients.length)} account(s) to migrate.`);

                let profileCount = 0;
                if (fs.existsSync(playersPath)) {
                    for (const dir of fs.readdirSync(playersPath)) {
                        const profileDir = path.join(playersPath, dir);
                        if (fs.statSync(profileDir).isDirectory()) {
                            profileCount += fs.readdirSync(profileDir).filter(f => f.endsWith('.json')).length;
                        }
                    }
                }
                LoggerService.log('info', `[DRY-RUN] ${colors.cyan(profileCount)} profile(s) to migrate.`);
            } else {
                LoggerService.log('info', '[DRY-RUN] Would read all MongoDB accounts and write them as JSON.');
                LoggerService.log('info', `[DRY-RUN] Destination: ${colors.cyan(path.join(process.cwd(), 'data'))}`);
            }

            LoggerService.log('info', `[DRY-RUN] No data written. Re-run without ${colors.cyan('--dry-run')} to execute.`);
            return;
        }

        if (!isConfirm) {
            LoggerService.log('warn', `You are about to migrate: ${colors.cyan(direction)}`);
            LoggerService.log('warn', 'Existing data at the destination will be overwritten!');
            LoggerService.log('warn', `Add ${colors.cyan('--confirm')} to proceed, or ${colors.cyan('--dry-run')} for a preview.`);
            if (from === 'json') {
                LoggerService.log('info', `MongoDB URI required: ${colors.cyan('--uri=mongodb://host:port/dbname')}`);
                LoggerService.log('info', `To also update server.properties: ${colors.cyan('--switch')}`);
                LoggerService.log('info', `Example: ${colors.cyan('/data migrate json mongodb --confirm --uri=mongodb://localhost:27017/neodyme')}`);
            } else {
                LoggerService.log('info', `Example: ${colors.cyan('/data migrate mongodb json --confirm')}`);
                LoggerService.log('info', `Add ${colors.cyan('--switch')} to switch server.properties to JSON.`);
            }
            return;
        }

        async function connectMongo(uri) {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
                LoggerService.log('info', 'MongoDB connection already active.');
                return true;
            }
            const masked = uri.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:***@');
            LoggerService.log('info', `Connecting to MongoDB: ${colors.cyan(masked)}`);
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
            LoggerService.log('success', 'MongoDB connected.');
            return true;
        }

        function updateServerProperties(dbType, dbPath) {
            const propFile = path.join(process.cwd(), 'server.properties');
            if (!fs.existsSync(propFile)) {
                LoggerService.log('warn', 'server.properties not found, skipping --switch.');
                return;
            }
            let content = fs.readFileSync(propFile, 'utf8');
            content = content.replace(/^databaseType=.*/m, `databaseType=${dbType}`);
            content = content.replace(/^databasePath=.*/m,  `databasePath=${dbPath}`);
            fs.writeFileSync(propFile, content, 'utf8');
            LoggerService.log('success', `server.properties updated → databaseType=${dbType}. Restart to apply.`);
        }

        if (from === 'json' && to === 'mongodb') {
            const ConfigManager = require('../manager/config-manager');
            const currentDbType = ConfigManager.get('databaseType', 'json');
            const currentDbPath = ConfigManager.get('databasePath', 'data/');

            let mongoUri = providedUri;
            if (!mongoUri) {
                if (currentDbType === 'mongodb') {
                    mongoUri = currentDbPath;
                    LoggerService.log('info', 'Using existing MongoDB connection.');
                } else {
                    LoggerService.log('error', 'No MongoDB URI provided.');
                    LoggerService.log('info', `Add: ${colors.cyan('--uri=mongodb://localhost:27017/neodyme')}`);
                    LoggerService.log('info', `Full example: ${colors.cyan('/data migrate json mongodb --confirm --uri=mongodb://localhost:27017/neodyme')}`);
                    return;
                }
            }

            try {
                await connectMongo(mongoUri);

                const MongoDatabase = require('../database/mongo-database');
                const dataPath    = path.join(process.cwd(), 'data');
                const playersPath = path.join(dataPath, 'players');
                const clientsFile = path.join(dataPath, 'clients.json');

                if (!fs.existsSync(clientsFile)) {
                    LoggerService.log('error', 'clients.json not found. Nothing to migrate.');
                    return;
                }

                const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));
                LoggerService.log('info', `Migrating ${colors.cyan(clients.length)} account(s) to MongoDB...`);

                let migrated = 0;
                let errors   = 0;

                for (const client of clients) {
                    try {
                        const existing = await MongoDatabase.getAccount(client.accountId);
                        if (!existing) {
                            await MongoDatabase.createAccount(
                                client.email,
                                client.password,
                                client.displayName,
                                { accountId: client.accountId, ...client }
                            );
                        }

                        if (fs.existsSync(playersPath)) {
                            const playerDir = path.join(playersPath, client.accountId);
                            if (fs.existsSync(playerDir)) {
                                const profileFiles = fs.readdirSync(playerDir).filter(f => f.endsWith('.json'));
                                for (const pf of profileFiles) {
                                    const profileType = pf.replace('.json', '');
                                    const profileData = JSON.parse(fs.readFileSync(path.join(playerDir, pf), 'utf8'));
                                    await MongoDatabase.saveProfile(client.accountId, profileType, profileData);
                                }
                            }
                        }
                        migrated++;
                    } catch (err) {
                        LoggerService.log('error', `Failed account ${client.accountId}: ${err.message}`);
                        errors++;
                    }
                }

                LoggerService.log('success', `Migration complete: ${colors.green(migrated)} migrated, ${errors > 0 ? colors.red(errors) : colors.green(errors)} error(s).`);

                if (doSwitch) {
                    updateServerProperties('mongodb', mongoUri);
                } else {
                    LoggerService.log('info', `Tip: add ${colors.cyan('--switch')} to update server.properties to MongoDB.`);
                }
            } catch (error) {
                LoggerService.log('error', `Migration failed: ${error.message}`);
            }
        }

        if (from === 'mongodb' && to === 'json') {
            try {
                const mongoose      = require('mongoose');
                const ConfigManager = require('../manager/config-manager');
                const currentDbType = ConfigManager.get('databaseType', 'json');
                const currentDbPath = ConfigManager.get('databasePath', 'data/');

                if (mongoose.connection.readyState !== 1) {
                    const mongoUri = providedUri || (currentDbType === 'mongodb' ? currentDbPath : null);
                    if (!mongoUri) {
                        LoggerService.log('error', 'No active MongoDB connection and no URI provided.');
                        LoggerService.log('info', `Add: ${colors.cyan('--uri=mongodb://localhost:27017/neodyme')}`);
                        return;
                    }
                    await connectMongo(mongoUri);
                }

                const MongoDatabase = require('../database/mongo-database');
                const dataPath    = path.join(process.cwd(), 'data');
                const playersPath = path.join(dataPath, 'players');

                if (!fs.existsSync(dataPath))    fs.mkdirSync(dataPath,    { recursive: true });
                if (!fs.existsSync(playersPath)) fs.mkdirSync(playersPath, { recursive: true });

                const accounts = await MongoDatabase.getAllAccounts();
                LoggerService.log('info', `Migrating ${colors.cyan(accounts.length)} account(s) from MongoDB to JSON...`);

                let migrated    = 0;
                let errors      = 0;
                const clientsList = [];

                for (const account of accounts) {
                    try {
                        clientsList.push(account);

                        const playerDir = path.join(playersPath, account.accountId);
                        if (!fs.existsSync(playerDir)) fs.mkdirSync(playerDir, { recursive: true });

                        const profiles = await MongoDatabase.getAllProfilesForAccount(account.accountId);
                        for (const [profileType, profileData] of Object.entries(profiles)) {
                            const filePath = path.join(playerDir, `${profileType}.json`);
                            fs.writeFileSync(filePath, JSON.stringify(profileData, null, 2), 'utf8');
                        }

                        migrated++;
                    } catch (err) {
                        LoggerService.log('error', `Failed account ${account.accountId}: ${err.message}`);
                        errors++;
                    }
                }

                const clientsFile = path.join(dataPath, 'clients.json');
                fs.writeFileSync(clientsFile, JSON.stringify(clientsList, null, 2), 'utf8');

                LoggerService.log('success', `Migration complete: ${colors.green(migrated)} migrated, ${errors > 0 ? colors.red(errors) : colors.green(errors)} error(s).`);

                if (doSwitch) {
                    updateServerProperties('json', 'data/');
                } else {
                    LoggerService.log('info', `Tip: add ${colors.cyan('--switch')} to update server.properties to JSON.`);
                }
            } catch (error) {
                LoggerService.log('error', `Migration failed: ${error.message}`);
            }
        }
    });
}

module.exports = { register };
