const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

router.get('/:symbol/history', stockController.getStockHistory);

module.exports = router;