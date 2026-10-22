const WebService = require('./web-service');
const { requireCap } = require('./role-middleware-service');
const { csrfProtection } = require('../token/csrf-token-service');

const gate = (capability) => [WebService.verifyToken, requireCap(capability)];
const gateWrite = (capability) => [WebService.verifyToken, requireCap(capability), csrfProtection];

module.exports = { gate, gateWrite };
