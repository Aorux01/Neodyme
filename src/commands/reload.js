const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const PluginManager = require('../manager/plugin-manager');
const ShopManager = require('../manager/shop-manager');

function register(CM) {
    CM.register('/reload', async (args) => {
        const target = args[0]?.toLowerCase() || 'all';

        const reloadConfig = async () => {
            LoggerService.log('info', 'Reloading configuration...');
            await ConfigManager.load();
            LoggerService.log('success', 'Configuration reloaded.');
        };

        const reloadPlugins = async () => {
            if (!ConfigManager.get('plugins')) {
                LoggerService.log('warn', 'Plugins are disabled in config, skipping plugin reload.');
                return;
            }
            LoggerService.log('info', 'Reloading plugins...');
            await PluginManager.unloadAll();
            await PluginManager.load();
            LoggerService.log('success', 'Plugins reloaded.');
        };

        const reloadShop = async () => {
            if (!ConfigManager.get('autoShopRotation')) {
                LoggerService.log('warn', 'Auto shop rotation is disabled, skipping shop reload.');
                return;
            }
            LoggerService.log('info', 'Reloading shop...');
            await ShopManager.initialize();
            LoggerService.log('success', 'Shop reloaded.');
        };

        switch (target) {
            case 'config':
                await reloadConfig();
                break;
            case 'plugins':
                await reloadPlugins();
                break;
            case 'shop':
                await reloadShop();
                break;
            case 'all':
            default:
                LoggerService.log('info', 'Reloading all subsystems...');
                await reloadConfig();
                await reloadPlugins();
                await reloadShop();
                LoggerService.log('success', 'Full reload complete. Note: active HTTP connections and XMPP require a server restart.');
                break;
        }
    });
}

module.exports = { register };
