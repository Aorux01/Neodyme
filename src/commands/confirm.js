const path = require('path');
const fs = require('fs');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const BackupManager = require('../manager/backup-manager');

function register(CM) {
    CM.register('/confirm', async (args) => {
        const action = args[0]?.toLowerCase();

        switch (action) {
            case 'restore':
                if (!CM.pendingRestore) {
                    LoggerService.log('error', 'No pending restore operation. Use "/backup restore <name>" first.');
                    return;
                }

                try {
                    LoggerService.log('info', `Starting restore from backup: ${CM.pendingRestore}`);
                    await BackupManager.restoreBackup(CM.pendingRestore);

                    LoggerService.log('success', `Backup ${CM.pendingRestore} restored successfully!`);
                    LoggerService.log('warn', 'Server restart required to apply changes.');
                    LoggerService.log('info', 'Use "/stop" to shutdown the server, then restart it.');

                    CM.pendingRestore = null;
                } catch (error) {
                    LoggerService.log('error', `Restore failed: ${error.message}`);
                    CM.pendingRestore = null;
                }
                break;

            case 'delete':
                if (!CM.pendingDelete) {
                    LoggerService.log('error', 'No pending delete operation. Use "/backup delete <name>" first.');
                    return;
                }

                try {
                    const backupsDir = path.join(process.cwd(), 'backups', CM.pendingDelete);
                    await fs.remove(backupsDir);

                    LoggerService.log('success', `Backup ${CM.pendingDelete} deleted successfully!`);
                    CM.pendingDelete = null;
                } catch (error) {
                    LoggerService.log('error', `Delete failed: ${error.message}`);
                    CM.pendingDelete = null;
                }
                break;

            default:
                LoggerService.log('info', 'Available confirmations:');
                LoggerService.log('info', `  ${colors.cyan('/confirm restore')} - Confirm backup restoration`);
                LoggerService.log('info', `  ${colors.cyan('/confirm delete')}  - Confirm backup deletion`);
                break;
        }
    });

    CM.register('/cancel', async () => {
        if (CM.pendingRestore) {
            LoggerService.log('info', `Cancelled pending restore: ${CM.pendingRestore}`);
            CM.pendingRestore = null;
        } else if (CM.pendingDelete) {
            LoggerService.log('info', `Cancelled pending delete: ${CM.pendingDelete}`);
            CM.pendingDelete = null;
        } else {
            LoggerService.log('info', 'No pending operations to cancel');
        }
    });
}

module.exports = { register };
