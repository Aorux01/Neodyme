const express = require('express');
const router = express.Router();

router.get('/waitingroom/api/waitingroom', (req, res) => {
    res.status(204).send();
});

module.exports = router;