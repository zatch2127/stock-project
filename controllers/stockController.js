const StockPriceHistory = require('../models/stockPriceHistory');

exports.getStockHistory = async (req, res) => {
  const { symbol } = req.params;

  try {
    const history = await StockPriceHistory.find({ stockSymbol: symbol });
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};