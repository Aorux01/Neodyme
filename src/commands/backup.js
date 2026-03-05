const path = require('path');
const fs = require('fs');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const BackupManager = require('../manager/backup-manager');

function register(CM) {
    CM.register('/backup', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'create':
                try {
                    LoggerService.log('info', 'Creating manual backup...');
                    const backupInfo = await BackupManager.createBackup(true);
                    const sizeMB = (backupInfo.size / 1024 / 1024).toFixed(2);
                    LoggerService.log('success', `Backup created: ${backupInfo.name} (${backupInfo.fileCount} files, ${sizeMB} MB)`);
                } catch (error) {
                    LoggerService.log('error', `Failed to create backup: ${error.message}`);
                }
                break;

            case 'list':
                try {
                    const backups = await BackupManager.listBackups();
                    if (backups.length === 0) {
                        LoggerService.log('info', 'No backups found');
                    } else {
                        LoggerService.log('info', `Found ${colors.cyan(backups.length)} backup(s):`);
                        backups.forEach((backup, index) => {
                            const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
                            const date = new Date(backup.timestamp).toLocaleString();
                            const status = backup.name === backups[0].name ? colors.green('(LATEST)') : '';
                            LoggerService.log('info',
                                `${index + 1}. ${colors.cyan(backup.name)} ${status}`
                            );
                            LoggerService.log('info', `     Size: ${colors.green(sizeMB + ' MB')} | Files: ${colors.cyan(backup.fileCount)} | Date: ${colors.gray(date)}`);
                        });
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to list backups: ${error.message}`);
                }
                break;

            case 'stats':
                try {
                    const stats = await BackupManager.getBackupStats();
                    LoggerService.log('info', 'Backup Statistics:');
                    LoggerService.log('info', `- Total backups: ${colors.cyan(stats.totalBackups)}`);
                    LoggerService.log('info', `- Total size: ${colors.green(stats.totalSizeMB + ' MB')}`);
                    LoggerService.log('info', `- Backup expiry: ${colors.cyan(stats.expiryDays + ' days')}`);
                    LoggerService.log('info', `- Auto backup interval: ${colors.cyan(ConfigManager.get('databaseBackupInterval') + ' minutes')}`);
                    LoggerService.log('info', `- Next backup: ${colors.cyan(stats.nextBackup ? new Date(stats.nextBackup).toLocaleString() : 'N/A')}`);
                    LoggerService.log('info', `- System status: ${stats.isRunning ? colors.yellow('Backup in progress...') : colors.green('Idle')}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to get backup stats: ${error.message}`);
                }
                break;

            case 'cleanup':
                try {
                    LoggerService.log('info', 'Cleaning up old backups...');
                    await BackupManager.cleanupOldBackups();
                    LoggerService.log('success', 'Backup cleanup completed');
                } catch (error) {
                    LoggerService.log('error', `Failed to cleanup backups: ${error.message}`);
                }
                break;

            case 'restore':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/backup restore <backup-name>')}`);
                    LoggerService.log('info', 'Use "/backup list" to see available backups');
                    return;
                }

                const backupName = args[1];
                try {
                    const backups = await BackupManager.listBackups();
                    const backupExists = backups.some(backup => backup.name === backupName);

                    if (!backupExists) {
                        LoggerService.log('error', `Backup "${backupName}" not found`);
                        return;
                    }

                    LoggerService.log('warn', `WARNING: You are about to restore backup: ${colors.red(backupName)}`);
                    LoggerService.log('warn', 'This will OVERWRITE all current data with the backup data!');
                    LoggerService.log('warn', 'The server will need to be restarted after restoration.');
                    LoggerService.log('warn', `Type ${colors.cyan('/confirm restore')} to confirm or anything else to cancel.`);

                    CM.pendingRestore = backupName;
                } catch (error) {
                    LoggerService.log('error', `Failed to prepare restore: ${error.message}`);
                }
                break;

            case 'delete':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/backup delete <backup-name>')}`);
                    LoggerService.log('info', 'Use "/backup list" to see available backups');
                    return;
                }

                const backupToDelete = args[1];
                try {
                    const backups = await BackupManager.listBackups();
                    const backupExists = backups.some(backup => backup.name === backupToDelete);

                    if (!backupExists) {
                        LoggerService.log('error', `Backup "${backupToDelete}" not found`);
                        return;
                    }

                    LoggerService.log('warn', `You are about to delete backup: ${colors.red(backupToDelete)}`);
                    LoggerService.log('warn', 'This action cannot be undone!');
                    LoggerService.log('warn', `Type ${colors.cyan('/confirm delete')} to confirm or anything else to cancel.`);

                    CM.pendingDelete = backupToDelete;
                } catch (error) {
                    LoggerService.log('error', `Failed to prepare delete: ${error.message}`);
                }
                break;

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/backup <create|list|stats|restore|delete|cleanup>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('create')}   - Create a manual backup`);
                LoggerService.log('info', `  ${colors.cyan('list')}     - List all available backups`);
                LoggerService.log('info', `  ${colors.cyan('stats')}    - Show backup system statistics`);
                LoggerService.log('info', `  ${colors.cyan('restore')}  - Restore a backup (requires confirmation)`);
                LoggerService.log('info', `  ${colors.cyan('delete')}   - Delete a backup (requires confirmation)`);
                LoggerService.log('info', `  ${colors.cyan('cleanup')}  - Force cleanup of old backups`);
                break;
        }
    });
}

module.exports = { register };
