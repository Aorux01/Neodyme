const express = require('express');
const router = express.Router();

router.post('/fortnite/api/game/v2/chat/*/*/*/pc', async (req, res) => {
    res.json({ GlobalChatRooms: [{ roomName: 'neodymeglobal' }] });
});

router.post('/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc', async (req, res) => {
    res.json({});
});

module.exports = router;
