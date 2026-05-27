const readline = require('readline');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');
const colors = require('../../utils/colors');

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
        console.log(colors.gray('─'.repeat(65)));
        console.log('');
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
