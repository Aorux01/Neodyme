const fs = require('fs');
const path = require('path');

const DatabaseManager = require('../../manager/DatabaseManager');

class AccountService {
    static getBanInfo(accountId) {
        const banInfo = DatabaseManager.AccountIsBanned(accountId);
        return banInfo;
    }
}

module.exports = AccountService;
