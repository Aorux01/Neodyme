const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const AuthService = require('../../src/service/api/auth-service');

if (!global.neodymeAccountCache) {
    global.neodymeAccountCache = new Map();
}

function getCachedAccount(ip) {
    const cached = global.neodymeAccountCache.get(ip);
    if (cached) {
        if (Date.now() - cached.timestamp < 3600000) {
            return cached;
        }
        global.neodymeAccountCache.delete(ip);
    }
    return null;
}

async function getAccountIdFromRequest(req) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    try {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.toLowerCase().startsWith('bearer eg1~')) {
            const token = authHeader.substring(7);
            const tokenData = await AuthService.verifyToken(token);
            if (tokenData && tokenData.account_id) {
                return { accountId: tokenData.account_id, displayName: tokenData.displayName };
            }
        }
    } catch (error) {
    }

    const cached = getCachedAccount(ip);
    if (cached) {
        return { accountId: cached.accountId, displayName: cached.displayName };
    }

    return null;
}

router.get('/sdk/v1/*', async (req, res) => {
    const sdk = JSON.parse(JSON.stringify(require("../../content/sdkv1.json")));

    const protocol = req.protocol;
    const host = req.get('host');
    const serverAddress = `${protocol}://${host}`;

    const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
    const xmppAddress = `${wsProtocol}://${host}`;

    if (sdk.client && sdk.client['Messaging.XMPP']) {
        sdk.client['Messaging.XMPP'].ServerAddr = xmppAddress;
    }

    res.json(sdk);
});

router.get('/epic/id/v2/sdk/accounts', async (req, res) => {
    let accountId = req.query.accountId;
    let displayName = accountId;

    if (!accountId || accountId === "unknown") {
        const account = await getAccountIdFromRequest(req);
        if (account) {
            accountId = account.accountId;
            displayName = account.displayName || accountId;
        }
    }

    if (!accountId || accountId === "unknown") {
        accountId = "unknown";
        displayName = "unknown";
    }

    if (displayName === accountId) {
        try {
            const user = DatabaseManager.getUser(accountId);
            if (user && user.displayName) {
                displayName = user.displayName;
            }
        } catch (error) {
        }
    }

    res.json([{
        "accountId": accountId,
        "displayName": displayName,
        "preferredLanguage": "en",
        "cabinedMode": false,
        "empty": false
    }]);
});

router.post('/epic/oauth/v2/token', async (req, res) => {
    const account = await getAccountIdFromRequest(req);
    let accountId = account ? account.accountId : "unknown";

    res.json({
        "scope": req.body.scope || "basic_profile friends_list openid presence",
        "token_type": "bearer",
        "access_token": `neodyme-eos-${accountId}`,
        "expires_in": 28800,
        "expires_at": "9999-12-31T23:59:59.999Z",
        "refresh_token": `neodyme-refresh-${accountId}`,
        "refresh_expires_in": 86400,
        "refresh_expires_at": "9999-12-31T23:59:59.999Z",
        "account_id": accountId,
        "client_id": "ec684b8c687f479fadea3cb2ad83f5c6",
        "application_id": "fghi4567FNFBKFz3E4TROb0bmPS8h1GW",
        "selected_account_id": accountId,
        "id_token": `neodyme-id-${accountId}`
    });
});

router.post('/auth/v1/oauth/token', async (req, res) => {
    res.json({
        "access_token": "neodyme-eos-access-token",
        "token_type": "bearer",
        "expires_in": 28800,
        "expires_at": "9999-12-31T23:59:59.999Z",
        "nonce": "neodyme-server",
        "features": [
            "AntiCheat",
            "CommerceService",
            "Connect",
            "ContentService",
            "Ecom",
            "EpicConnect",
            "Inventories",
            "LockerService",
            "MagpieService",
            "Matchmaking Service",
            "PCBService",
            "QuestService",
            "Stats"
        ],
        "deployment_id": "62a9473a2dca46b29ccf17577fcf42d7",
        "organization_id": "o-ue4bpvkjckhbrvqsxhbksgcfvqstre",
        "organization_user_id": "neodyme-org-user-id",
        "product_id": "prod-fn",
        "product_user_id": "neodyme-product-user-id",
        "product_user_id_created": false,
        "id_token": "neodyme-id-token",
        "sandbox_id": "fn"
    });
});

router.get('/hotconfigs/v2/livefn.json', (req, res) => {
    res.json({});
});

router.post('/fortnite/api/game/v2/profileToken/verify/:accountId', (req, res) => {
    res.status(204).end();
});

router.post('/datarouter/api/v1/public/data/clients', (req, res) => {
    res.status(204).end();
});

router.get('/epic/friends/v1/:accountId/blocklist', (req, res) => {
    res.json([]);
});

module.exports = router;
