const path = require('path');
const fs = require('fs');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const BackupManager = require('../manager/backup-manager');
const DatabaseManager = require('../manager/database-manager');

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

            case 'account-delete':
                if (!CM.pendingAccountDelete) {
                    LoggerService.log('error', 'No pending account deletion. Use "/account delete <username>" first.');
                    return;
                }
                try {
                    const name = CM.pendingAccountDeleteName || CM.pendingAccountDelete;
                    const ok = await DatabaseManager.deleteAccount(CM.pendingAccountDelete);
                    if (ok) {
                        LoggerService.log('success', `Account "${name}" has been permanently deleted.`);
                    } else {
                        LoggerService.log('error', `Failed to delete account "${name}" (not found).`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Account deletion failed: ${error.message}`);
                } finally {
                    CM.pendingAccountDelete = null;
                    CM.pendingAccountDeleteName = null;
                }
                break;

            case 'account-reset':
                if (!CM.pendingAccountReset) {
                    LoggerService.log('error', 'No pending account reset. Use "/account reset <username>" first.');
                    return;
                }
                try {
                    const name = CM.pendingAccountResetName || CM.pendingAccountReset;
                    const ok = await DatabaseManager.resetAccount(CM.pendingAccountReset);
                    if (ok) {
                        LoggerService.log('success', `Account "${name}" has been reset. All game data erased.`);
                    } else {
                        LoggerService.log('error', `Failed to reset account "${name}" (not found).`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Account reset failed: ${error.message}`);
                } finally {
                    CM.pendingAccountReset = null;
                    CM.pendingAccountResetName = null;
                }
                break;

            default:
                LoggerService.log('info', 'Available confirmations:');
                LoggerService.log('info', `  ${colors.cyan('/confirm restore')}       - Confirm backup restoration`);
                LoggerService.log('info', `  ${colors.cyan('/confirm delete')}        - Confirm backup deletion`);
                LoggerService.log('info', `  ${colors.cyan('/confirm account-delete')} - Confirm permanent account deletion`);
                LoggerService.log('info', `  ${colors.cyan('/confirm account-reset')}  - Confirm account game data reset`);
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
        } else if (CM.pendingAccountDelete) {
            LoggerService.log('info', `Cancelled account deletion for: ${CM.pendingAccountDeleteName || CM.pendingAccountDelete}`);
            CM.pendingAccountDelete = null;
            CM.pendingAccountDeleteName = null;
        } else if (CM.pendingAccountReset) {
            LoggerService.log('info', `Cancelled account reset for: ${CM.pendingAccountResetName || CM.pendingAccountReset}`);
            CM.pendingAccountReset = null;
            CM.pendingAccountResetName = null;
        } else {
            LoggerService.log('info', 'No pending operations to cancel');
        }
    });
}

module.exports = { register };
