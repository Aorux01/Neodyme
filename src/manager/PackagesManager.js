// src/manager/PackagesManager.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PackagesManager {
    static checkAndInstall() {
        const nodeModulesExist = fs.existsSync(path.join(process.cwd(), 'node_modules'));
        const packageJsonExist = fs.existsSync(path.join(process.cwd(), 'package.json'));

        if (!packageJsonExist) {
            throw new Error('package.json not found!');
        }

        if (!nodeModulesExist) {
            console.log('Installing dependencies...');
            try {
                execSync('npm install', { stdio: 'inherit' });
                console.log('Dependencies installed successfully!');
                return true;
            } catch (error) {
                throw new Error('Failed to install dependencies');
            }
        }
        return false;
    }
}

module.exports = PackagesManager;