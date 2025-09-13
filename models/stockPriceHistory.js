const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockPriceHistorySchema = new Schema({
  stockSymbol: {
    type: String,
    required: true,
    index: true
  },
  price: {
    type: Schema.Types.Decimal128,
    required: true
  },
}, { timestamps: { createdAt: 'fetchedAt' } });

module.exports = mongoose.model('StockPriceHistory', stockPriceHistorySchema);
