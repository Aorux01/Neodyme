const fs = require('fs');
const path = require('path');

const DatabaseManager = require('../../manager/database-manager');

class AccountService {
    static getBanInfo(accountId) {
        const banInfo = DatabaseManager.AccountIsBanned(accountId);
        return banInfo;
    }
    
    static getCachedAccount(ip) {
        const cached = global.neodymeAccountCache.get(ip);
        if (cached) {
            if (Date.now() - cached.timestamp < 3600000) {
                return cached;
            }
            global.neodymeAccountCache.delete(ip);
        }
        return null;
    }
}

module.exports = AccountService;
