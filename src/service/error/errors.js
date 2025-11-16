const fs = require('fs');
const path = require('path');
const LoggerService = require('../logger/LoggerService');

let errorDefinitions = {};
try {
    const errorsPath = path.join(__dirname, 'Errors.json');
    errorDefinitions = JSON.parse(fs.readFileSync(errorsPath, 'utf8'));
} catch (error) {
    LoggerService.log('error', `Failed to load errors.json: ${error}`);
}

class ApiError extends Error {
    constructor(code, message, numericCode, statusCode, ...messageVars) {
        super(message);
        this.name = 'ApiError';
        this.errorCode = code;
        this.errorMessage = message;
        this.numericErrorCode = numericCode;
        this.statusCode = statusCode;
        this.messageVars = messageVars.length > 0 ? messageVars : undefined;
        this.originatingService = 'Neodyme';
        this.intent = 'prod';
    }

    static fromDefinition(errorKey, ...messageVars) {
        const parts = errorKey.split('.');
        let current = errorDefinitions;
        
        for (const part of parts) {
            if (current[part]) {
                current = current[part];
            } else {
                return new ApiError(
                    'errors.com.epicgames.common.unknown',
                    'An unknown error occurred',
                    1000,
                    500
                );
            }
        }

        if (typeof current === 'object' && current.code) {
            let message = current.message;
            
            if (messageVars.length > 0) {
                messageVars.forEach((value, index) => {
                    message = message.replace(`{${index}}`, value);
                });
            }

            return new ApiError(
                current.code,
                message,
                current.numericCode,
                current.statusCode,
                ...messageVars
            );
        }

        return new ApiError(
            'errors.com.epicgames.common.unknown',
            'An unknown error occurred',
            1000,
            500
        );
    }

    withMessageVars(vars) {
        this.messageVars = vars;
        return this;
    }

    withIntent(intent) {
        this.intent = intent;
        return this;
    }

    withOriginatingService(service) {
        this.originatingService = service;
        return this;
    }

    toJSON() {
        return {
            errorCode: this.errorCode,
            errorMessage: this.errorMessage,
            messageVars: this.messageVars,
            numericErrorCode: this.numericErrorCode,
            originatingService: this.originatingService,
            intent: this.intent
        };
    }
}

function sendError(res, error) {
    const errorResponse = error instanceof ApiError ? error : new ApiError(
        'errors.com.epicgames.common.server_error',
        'An error occurred while processing your request',
        1000,
        500
    );

    res.status(errorResponse.statusCode)
        .set({
            'Content-Type': 'application/json',
            'X-Epic-Error-Code': errorResponse.numericErrorCode.toString(),
            'X-Epic-Error-Name': errorResponse.errorCode
        })
        .json(errorResponse.toJSON());
}

const Errors = {
    Authentication: {
        invalidHeader: () => ApiError.fromDefinition('authentication.invalidHeader'),
        invalidRequest: () => ApiError.fromDefinition('authentication.invalidRequest'),
        invalidToken: (token) => ApiError.fromDefinition('authentication.invalidToken', token),
        wrongGrantType: () => ApiError.fromDefinition('authentication.wrongGrantType'),
        notYourAccount: () => ApiError.fromDefinition('authentication.notYourAccount'),
        validationFailed: (token) => ApiError.fromDefinition('authentication.validationFailed', token),
        authenticationFailed: (method) => ApiError.fromDefinition('authentication.authenticationFailed', method),
        unknownSession: (sessionId) => ApiError.fromDefinition('authentication.unknownSession', sessionId),
        usedClientToken: () => ApiError.fromDefinition('authentication.usedClientToken'),
        
        OAuth: {
            invalidBody: () => ApiError.fromDefinition('authentication.oauth.invalidBody'),
            unsupportedGrant: (grant) => ApiError.fromDefinition('authentication.oauth.unsupportedGrant', grant),
            invalidExternalAuthType: (type) => ApiError.fromDefinition('authentication.oauth.invalidExternalAuthType', type),
            grantNotImplemented: (grant) => ApiError.fromDefinition('authentication.oauth.grantNotImplemented', grant),
            tooManySessions: () => ApiError.fromDefinition('authentication.oauth.tooManySessions'),
            invalidAccountCredentials: () => ApiError.fromDefinition('authentication.oauth.invalidAccountCredentials'),
            invalidRefresh: () => ApiError.fromDefinition('authentication.oauth.invalidRefresh'),
            invalidClient: () => ApiError.fromDefinition('authentication.oauth.invalidClient'),
            invalidExchange: (code) => ApiError.fromDefinition('authentication.oauth.invalidExchange', code),
            expiredExchangeCodeSession: () => ApiError.fromDefinition('authentication.oauth.expiredExchangeCodeSession'),
            correctiveActionRequired: () => ApiError.fromDefinition('authentication.oauth.correctiveActionRequired')
        }
    },

    Account: {
        disabledAccount: () => ApiError.fromDefinition('account.disabledAccount'),
        inactiveAccount: () => ApiError.fromDefinition('account.inactiveAccount'),
        invalidAccountIdCount: () => ApiError.fromDefinition('account.invalidAccountIdCount'),
        accountNotFound: (displayName) => ApiError.fromDefinition('account.accountNotFound', displayName)
    },

    MCP: {
        profileNotFound: (accountId) => ApiError.fromDefinition('mcp.profileNotFound', accountId),
        emptyItems: () => ApiError.fromDefinition('mcp.emptyItems'),
        notEnoughMtx: (item, required, balance) => ApiError.fromDefinition('mcp.notEnoughMtx', item, required, balance),
        wrongCommand: () => ApiError.fromDefinition('mcp.wrongCommand'),
        operationForbidden: () => ApiError.fromDefinition('mcp.operationForbidden'),
        templateNotFound: () => ApiError.fromDefinition('mcp.templateNotFound'),
        invalidHeader: () => ApiError.fromDefinition('mcp.invalidHeader'),
        invalidPayload: () => ApiError.fromDefinition('mcp.invalidPayload'),
        missingPermission: (resource, action) => ApiError.fromDefinition('mcp.missingPermission', resource, action),
        itemNotFound: () => ApiError.fromDefinition('mcp.itemNotFound'),
        wrongItemType: (itemId, itemType) => ApiError.fromDefinition('mcp.wrongItemType', itemId, itemType),
        operationNotFound: () => ApiError.fromDefinition('mcp.operationNotFound'),
        invalidLockerSlotIndex: (index) => ApiError.fromDefinition('mcp.invalidLockerSlotIndex', index),
        outOfBounds: (source, target) => ApiError.fromDefinition('mcp.outOfBounds', source, target),
        insufficientCurrency: (totalPrice, quantity) => ApiError.fromDefinition('mcp.insufficientCurrency', totalPrice, quantity),
        personalMessageTooLong: () => ApiError.fromDefinition('mcp.personalMessageTooLong', ),
        invalidGiftBox: () => ApiError.fromDefinition('mcp.invalidGiftBox', ),
        duplicateReceivers: () => ApiError.fromDefinition('mcp.duplicateReceivers', ),
        offerNotFound: (profileId) => ApiError.fromDefinition('mcp.offerNotFound', profileId)
    },

    Party: {
        partyNotFound: (partyId) => ApiError.fromDefinition('party.partyNotFound', partyId),
        memberNotFound: (memberId) => ApiError.fromDefinition('party.memberNotFound', memberId),
        alreadyInParty: () => ApiError.fromDefinition('party.alreadyInParty'),
        userHasNoParty: (userId) => ApiError.fromDefinition('party.userHasNoParty', userId),
        notLeader: () => ApiError.fromDefinition('party.notLeader'),
        pingNotFound: () => ApiError.fromDefinition('party.pingNotFound'),
        pingForbidden: () => ApiError.fromDefinition('party.pingForbidden'),
        notYourAccount: () => ApiError.fromDefinition('party.notYourAccount'),
        userOffline: () => ApiError.fromDefinition('party.userOffline'),
        selfPing: () => ApiError.fromDefinition('party.selfPing'),
        selfInvite: () => ApiError.fromDefinition('party.selfInvite')
    },

    CloudStorage: {
        fileNotFound: () => ApiError.fromDefinition('cloudstorage.fileNotFound'),
        fileTooLarge: () => ApiError.fromDefinition('cloudstorage.fileTooLarge'),
        invalidAuth: () => ApiError.fromDefinition('cloudstorage.invalidAuth')
    },

    Friends: {
        selfFriend: () => ApiError.fromDefinition('friends.selfFriend'),
        accountNotFound: () => ApiError.fromDefinition('friends.accountNotFound'),
        friendshipNotFound: () => ApiError.fromDefinition('friends.friendshipNotFound'),
        requestAlreadySent: () => ApiError.fromDefinition('friends.requestAlreadySent'),
        invalidData: () => ApiError.fromDefinition('friends.invalidData')
    },

    Matchmaking: {
        unknownSession: () => ApiError.fromDefinition('matchmaking.unknownSession'),
        missingCookie: () => ApiError.fromDefinition('matchmaking.missingCookie'),
        invalidBucketId: () => ApiError.fromDefinition('matchmaking.invalidBucketId'),
        invalidPartyPlayers: () => ApiError.fromDefinition('matchmaking.invalidPartyPlayers'),
        invalidPlatform: () => ApiError.fromDefinition('matchmaking.invalidPlatform'),
        notAllowedIngame: () => ApiError.fromDefinition('matchmaking.notAllowedIngame')
    },

    Storefront: {
        invalidItem: () => ApiError.fromDefinition('storefront.invalidItem'),
        currencyInsufficient: () => ApiError.fromDefinition('storefront.currencyInsufficient'),
        hasAllItems: () => ApiError.fromDefinition('storefront.hasAllItems'),
        alreadyOwned: () => ApiError.fromDefinition('storefront.alreadyOwned')
    },

    GameCatalog: {
        invalidParameter: () => ApiError.fromDefinition('gamecatalog.invalidParameter'),
        itemNotFound: (offerId) => ApiError.fromDefinition('gamecatalog.itemNotFound', offerId),
        priceMismatch: (expected, actual) => ApiError.fromDefinition('gamecatalog.priceMismatch', expected.toString(), actual.toString()),
        priceNotFound: (currency, subType, offerId) => ApiError.fromDefinition('gamecatalog.priceNotFound', currency, subType, offerId),
        purchaseNotAllowed: (devName, fulfillmentId, count, limit) => 
            ApiError.fromDefinition('gamecatalog.purchaseNotAllowed', devName, fulfillmentId, count.toString(), limit.toString())
    },

    Internal: {
        validationFailed: (fields) => ApiError.fromDefinition('internal.validationFailed', fields),
        unknownRoute: () => ApiError.fromDefinition('internal.unknownRoute'),
        invalidUserAgent: () => ApiError.fromDefinition('internal.invalidUserAgent'),
        serverError: () => ApiError.fromDefinition('internal.serverError'),
        jsonParsingFailed: () => ApiError.fromDefinition('internal.jsonParsingFailed'),
        requestTimedOut: () => ApiError.fromDefinition('internal.requestTimedOut'),
        unsupportedMediaType: () => ApiError.fromDefinition('internal.unsupportedMediaType'),
        notImplemented: () => ApiError.fromDefinition('internal.notImplemented'),
        dataBaseError: () => ApiError.fromDefinition('internal.dataBaseError'),
        unknownError: () => ApiError.fromDefinition('internal.unknownError')
    },

    Basic: {
        badRequest: () => ApiError.fromDefinition('basic.badRequest'),
        notFound: () => ApiError.fromDefinition('basic.notFound'),
        notAcceptable: () => ApiError.fromDefinition('basic.notAcceptable'),
        methodNotAllowed: () => ApiError.fromDefinition('basic.methodNotAllowed'),
        jsonMappingFailed: () => ApiError.fromDefinition('basic.jsonMappingFailed'),
        throttled: () => ApiError.fromDefinition('basic.throttled')
    },

    custom: (code, message, numericCode, statusCode) => new ApiError(code, message, numericCode, statusCode)
};

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof ApiError) {
        sendError(res, err);
    } else if (err.name === 'ValidationError') {
        sendError(res, Errors.Internal.validationFailed(Object.keys(err.errors).join(', ')));
    } else if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
        sendError(res, Errors.Internal.jsonParsingFailed());
    } else {
        LoggerService.log('error', `Unhandled error: ${err}`);
        sendError(res, Errors.Internal.serverError());
    }
}

module.exports = {
    ApiError,
    sendError,
    errorHandler,
    Errors
};