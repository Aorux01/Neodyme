const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const LoggerService = require('../service/logger/LoggerService');
const ConfigManager = require('./ConfigManager');

class BackupManager {
    static backupInterval = null;
    static isBackupRunning = false;

    static async initialize() {
        try {
            const backupsDir = path.join(process.cwd(), 'backups');
            await fs.ensureDir(backupsDir);

            LoggerService.log('success', 'Backup system initialized');

            this.scheduleBackups();

            await this.cleanupOldBackups();

            return true;
        } catch (error) {
            LoggerService.log('error', 'Failed to initialize backup system:', { error: error.message });
            return false;
        }
    }

    static scheduleBackups() {
        const intervalMinutes = ConfigManager.get('databaseBackupInterval');
        
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        this.backupInterval = setInterval(async () => {
            await this.createBackup();
        }, intervalMinutes * 60 * 1000);

        LoggerService.log('info', `Backups scheduled every ${intervalMinutes} minutes`);
    }

    static async createBackup(manual = false) {
        if (this.isBackupRunning) {
            LoggerService.log('warn', 'Backup already in progress, skipping...');
            return;
        }

        this.isBackupRunning = true;

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `backup-${timestamp}`;
            const backupDir = path.join(process.cwd(), 'backups', backupName);
            
            LoggerService.log('info', `Creating backup: ${backupName}`);

            await fs.ensureDir(backupDir);

            const sourceDir = path.join(process.cwd(), 'data');

            if (!await fs.pathExists(sourceDir)) {
                LoggerService.log('warn', 'Source data directory does not exist, skipping backup');
                return;
            }

            await fs.copy(sourceDir, backupDir, {
                filter: (src) => {
                    const basename = path.basename(src);
                    return !basename.startsWith('.') &&
                           !basename.includes('temp') &&
                           !basename.includes('cache');
                }
            });

            const backupInfo = {
                name: backupName,
                timestamp: new Date().toISOString(),
                size: await this.getFolderSize(backupDir),
                fileCount: await this.countFiles(backupDir),
                version: require('../../package.json').version || 'unknown'
            };

            await fs.writeJson(path.join(backupDir, 'backup-info.json'), backupInfo, { spaces: 2 });

            const backupSize = (backupInfo.size / 1024 / 1024).toFixed(2);
            LoggerService.log('success', `Backup created: ${backupName} (${backupInfo.fileCount} files, ${backupSize} MB)`);

            await this.cleanupOldBackups();

            return backupInfo;

        } catch (error) {
            LoggerService.log('error', 'Backup creation failed:', { error: error.message });
            throw error;
        } finally {
            this.isBackupRunning = false;
        }
    }

    static async getFolderSize(folderPath) {
        try {
            let totalSize = 0;
            
            const getSize = async (dir) => {
                const items = await fs.readdir(dir);
                
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stat = await fs.stat(itemPath);
                    
                    if (stat.isDirectory()) {
                        await getSize(itemPath);
                    } else {
                        totalSize += stat.size;
                    }
                }
            };
            
            await getSize(folderPath);
            return totalSize;
        } catch (error) {
            LoggerService.log('error', 'Failed to calculate folder size:', { error: error.message });
            return 0;
        }
    }

    static async countFiles(folderPath) {
        try {
            let fileCount = 0;
            
            const count = async (dir) => {
                const items = await fs.readdir(dir);
                
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stat = await fs.stat(itemPath);
                    
                    if (stat.isDirectory()) {
                        await count(itemPath);
                    } else {
                        fileCount++;
                    }
                }
            };
            
            await count(folderPath);
            return fileCount;
        } catch (error) {
            LoggerService.log('error', 'Failed to count files:', { error: error.message });
            return 0;
        }
    }

    static async cleanupOldBackups() {
        try {
            const expiryDays = ConfigManager.get('databaseBackupExpiryDays');
            const backupsDir = path.join(process.cwd(), 'backups');
            
            if (!await fs.pathExists(backupsDir)) {
                return;
            }

            const backups = await fs.readdir(backupsDir);
            const now = Date.now();
            const maxAge = expiryDays * 24 * 60 * 60 * 1000;

            let deletedCount = 0;

            for (const backup of backups) {
                if (backup.startsWith('backup-')) {
                    const backupPath = path.join(backupsDir, backup);
                    const stats = await fs.stat(backupPath);
                    
                    if (now - stats.mtime.getTime() > maxAge) {
                        await fs.remove(backupPath);
                        deletedCount++;
                        LoggerService.log('info', `Deleted old backup: ${backup}`);
                    }
                }
            }

            if (deletedCount > 0) {
                LoggerService.log('success', `Cleaned up ${deletedCount} old backup(s)`);
            }

        } catch (error) {
            LoggerService.log('error', 'Backup cleanup failed:', { error: error.message });
        }
    }

    static async listBackups() {
        try {
            const backupsDir = path.join(process.cwd(), 'backups');
            
            if (!await fs.pathExists(backupsDir)) {
                return [];
            }

            const backups = await fs.readdir(backupsDir);
            const backupList = [];

            for (const backup of backups) {
                if (backup.startsWith('backup-')) {
                    const backupPath = path.join(backupsDir, backup);
                    const infoPath = path.join(backupPath, 'backup-info.json');
                    
                    let info = {};
                    if (await fs.pathExists(infoPath)) {
                        info = await fs.readJson(infoPath);
                    } else {
                        const stats = await fs.stat(backupPath);
                        info = {
                            name: backup,
                            timestamp: stats.mtime.toISOString(),
                            size: await this.getFolderSize(backupPath),
                            fileCount: await this.countFiles(backupPath)
                        };
                    }

                    backupList.push(info);
                }
            }

            backupList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return backupList;

        } catch (error) {
            LoggerService.log('error', 'Failed to list backups:', { error: error.message });
            return [];
        }
    }

    static async restoreBackup(backupName) {
        try {
            const backupDir = path.join(process.cwd(), 'backups', backupName);
            const targetDir = path.join(process.cwd(), 'data');

            if (!await fs.pathExists(backupDir)) {
                throw new Error(`Backup ${backupName} not found`);
            }

            LoggerService.log('info', `Restoring backup: ${backupName}`);

            const tempBackupName = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
            const tempBackupDir = path.join(process.cwd(), 'backups', tempBackupName);
            
            if (await fs.pathExists(targetDir)) {
                await fs.copy(targetDir, tempBackupDir);
                LoggerService.log('info', `Current data backed up as: ${tempBackupName}`);
            }

            await fs.remove(targetDir);

            await fs.copy(backupDir, targetDir);

            LoggerService.log('success', `Backup restored successfully: ${backupName}`);
            return true;

        } catch (error) {
            LoggerService.log('error', 'Backup restoration failed:', { error: error.message });
            throw error;
        }
    }

    static async getBackupStats() {
        try {
            const backups = await this.listBackups();
            const backupsDir = path.join(process.cwd(), 'backups');
            
            let totalSize = 0;
            let totalBackups = backups.length;

            for (const backup of backups) {
                totalSize += backup.size || 0;
            }

            const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
            const expiryDays = ConfigManager.get('databaseBackupExpiryDays');

            return {
                totalBackups,
                totalSize: totalSize,
                totalSizeMB,
                expiryDays,
                nextBackup: this.getNextBackupTime(),
                isRunning: this.isBackupRunning
            };

        } catch (error) {
            LoggerService.log('error', 'Failed to get backup stats:', { error: error.message });
            return {};
        }
    }

    static getNextBackupTime() {
        if (!this.backupInterval) return null;
        
        const intervalMinutes = ConfigManager.get('databaseBackupInterval');
        const nextTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
        return nextTime.toISOString();
    }

    static async shutdown() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
        }
        
        LoggerService.log('info', 'Backup system shut down');
    }
}

module.exports = BackupManager;