const readline = require('readline');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');
const colors = require('../../utils/colors');
const AssetService = require('../api/asset-service');
const AssetInstaller = require('../../manager/asset-installer');

class FirstLaunchService {
    static async run() {
        await this.promptAssetsMode();
    }

    static async promptAssetsMode() {
        const current = ConfigManager.get('assetsMode', '');
        if (current === 'online' || current === 'local') {
            return; // already configured
        }

        // Don't block automated / non-interactive launches (CI, systemd, docker).
        if (!process.stdin.isTTY) {
            LoggerService.log('info', 'assetsMode is empty and stdin is not a TTY - defaulting to "online"');
            await ConfigManager.save('assetsMode', 'online');
            return;
        }

        console.log('');
        console.log(colors.gray('─'.repeat(65)));
        console.log(colors.cyan('  NEODYME - Asset serving setup'));
        console.log(colors.gray('─'.repeat(65)));
        console.log('');
        console.log('  How should Neodyme serve Fortnite assets (images, etc.)?');
        console.log('');
        console.log(`    ${colors.cyan('[O]')} Online (default)  - Redirect requests to the original CDNs.`);
        console.log(`                            No disk usage, requires internet at runtime.`);
        console.log(`    ${colors.cyan('[L]')} Local             - Serve from public/images/. Missing files`);
        console.log(`                            fall back to the CDN with a warning log.`);
        console.log('');

        const answer = await this.ask(`  Your choice [O/L] (default: O): `);
        const choice = (answer || '').trim().toLowerCase();

        let mode;
        if (choice === 'l' || choice === 'local') {
            mode = 'local';
        } else {
            mode = 'online';
        }

        await ConfigManager.save('assetsMode', mode);
        console.log('');
        LoggerService.log('success', `Asset mode set to ${colors.cyan(mode)} - change later with '/assets mode <online|local>'`);

        if (mode === 'local') {
            await this.downloadLocalAssets();
        }

        console.log(colors.gray('─'.repeat(65)));
        console.log('');
    }

    static async downloadLocalAssets() {
        let missing;
        try {
            missing = AssetService.getMissingAssets();
        } catch (error) {
            LoggerService.log('warn', `Could not determine missing assets: ${error.message}`);
            LoggerService.log('info', `You can download them later with ${colors.cyan('/assets install')}`);
            return;
        }

        if (!missing || missing.length === 0) {
            LoggerService.log('success', 'All indexed assets are already present locally.');
            return;
        }

        LoggerService.log('info', `${missing.length} asset(s) missing locally. Auto-downloading...`);
        try {
            await AssetInstaller.installAllMissing();
        } catch (error) {
            LoggerService.log('error', `Auto-download failed: ${error.message}`);
            LoggerService.log('info', `You can retry later with ${colors.cyan('/assets install')}`);
        }
    }

    static ask(question) {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
}

module.exports = FirstLaunchService;
