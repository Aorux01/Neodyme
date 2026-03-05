const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ShopManager = require('../manager/shop-manager');

function register(CM) {
    CM.register('/shop', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'rotate':
                try {
                    LoggerService.log('info', 'Forcing shop rotation...');
                    await ShopManager.forceRotation();
                    LoggerService.log('success', 'Shop has been rotated successfully!');
                } catch (error) {
                    LoggerService.log('error', `Failed to rotate shop: ${error.message}`);
                }
                break;

            case 'info':
                try {
                    const shopData = await ShopManager.getShopData();
                    const items = Object.keys(shopData).filter(key => !key.startsWith('//'));

                    LoggerService.log('info', `Current shop contains ${colors.cyan(items.length)} items:`);

                    const dailyItems = items.filter(key => key.startsWith('daily'));
                    const featuredItems = items.filter(key => key.startsWith('featured'));

                    LoggerService.log('info', `  Daily items: ${colors.cyan(dailyItems.length)}`);
                    LoggerService.log('info', `  Featured items: ${colors.cyan(featuredItems.length)}`);

                    if (dailyItems.length > 0) {
                        LoggerService.log('info', '\nDaily Items:');
                        dailyItems.slice(0, 3).forEach(key => {
                            const item = shopData[key];
                            const itemName = item.itemGrants[0]?.split(':')[1] || 'Unknown';
                            LoggerService.log('info', `- ${itemName} - ${colors.green(item.price)} V-Bucks`);
                        });
                        if (dailyItems.length > 3) {
                            LoggerService.log('info', `  ... and ${dailyItems.length - 3} more`);
                        }
                    }

                    if (featuredItems.length > 0) {
                        LoggerService.log('info', '\nFeatured Items:');
                        featuredItems.slice(0, 3).forEach(key => {
                            const item = shopData[key];
                            const itemName = item.itemGrants[0]?.split(':')[1] || 'Unknown';
                            LoggerService.log('info', `- ${itemName} - ${colors.green(item.price)} V-Bucks`);
                        });
                        if (featuredItems.length > 3) {
                            LoggerService.log('info', `  ... and ${featuredItems.length - 3} more`);
                        }
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to retrieve shop info: ${error.message}`);
                }
                break;

            case 'status':
                try {
                    const state = await ShopManager.getShopState();

                    if (state.lastRotation) {
                        const lastRotation = new Date(state.lastRotation);
                        LoggerService.log('info', `Last rotation: ${colors.cyan(lastRotation.toLocaleString())}`);
                    } else {
                        LoggerService.log('info', 'Last rotation: Never');
                    }

                    if (state.nextRotation) {
                        const nextRotation = new Date(state.nextRotation);
                        const now = new Date();
                        const timeUntil = nextRotation.getTime() - now.getTime();
                        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
                        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));

                        LoggerService.log('info', `Next rotation: ${colors.cyan(nextRotation.toLocaleString())}`);
                        LoggerService.log('info', `Time until next rotation: ${colors.cyan(`${hoursUntil}h ${minutesUntil}m`)}`);
                    } else {
                        LoggerService.log('info', 'Next rotation: Not scheduled');
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to retrieve shop status: ${error.message}`);
                }
                break;

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/shop <rotate|info|status>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('rotate')} - Force shop rotation`);
                LoggerService.log('info', `  ${colors.cyan('info')}   - Display current shop items`);
                LoggerService.log('info', `  ${colors.cyan('status')} - Show shop rotation status`);
                break;
        }
    });
}

module.exports = { register };
