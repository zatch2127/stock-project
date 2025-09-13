const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/rewardController');

router.post('/', rewardController.createReward);
router.get('/today-stocks/:userId', rewardController.getTodaysRewardsForUser);
router.get('/historical-inr/:userId', rewardController.getHistoricalInr);
router.get('/stats/:userId', rewardController.getStats);
router.get('/portfolio/:userId', rewardController.getPortfolio);

module.exports = router;