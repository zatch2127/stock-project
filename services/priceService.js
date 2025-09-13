const StockPriceHistory = require("../models/stockPriceHistory");

const latestPrices = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const priceCache = new Map();

const BASE_PRICES = {
  RELIANCE: 2500,
  TCS: 3500,
  INFOSYS: 1500,
  HDFC: 1600,
  ICICIBANK: 900,
  BHARTIARTL: 800,
  ITC: 400,
  SBIN: 500,
  KOTAKBANK: 1800,
  LT: 3000,
};

async function getLatestPrice(stockSymbol) {
  const normalizedSymbol = stockSymbol.toUpperCase().trim();

  const cached = priceCache.get(normalizedSymbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
    const lastPrice = await StockPriceHistory.findOne({
      stockSymbol: normalizedSymbol,
    }).sort({ fetchedAt: -1 });

    let price;
    if (lastPrice) {
      const basePrice = parseFloat(lastPrice.price.toString());
      const volatility = (Math.random() - 0.5) * 0.04;
      price = basePrice * (1 + volatility);
    } else {
      const basePrice = BASE_PRICES[normalizedSymbol] || 1000;
      const volatility = (Math.random() - 0.5) * 0.1;
      price = basePrice * (1 + volatility);
    }

    price = Math.max(price, 1);
    price = parseFloat(price.toFixed(4));

    priceCache.set(normalizedSymbol, {
      price,
      timestamp: Date.now(),
    });

    await StockPriceHistory.create({
      stockSymbol: normalizedSymbol,
      price: price,
    });

    return price;
  } catch (error) {
    console.error(`Error fetching price for ${normalizedSymbol}:`, error);

    if (cached) {
      return cached.price;
    }

    throw new Error(`Unable to fetch price for ${normalizedSymbol}`);
  }
}

async function getHistoricalPrices(stockSymbol, fromDate, toDate) {
  const normalizedSymbol = stockSymbol.toUpperCase().trim();

  return await StockPriceHistory.find({
    stockSymbol: normalizedSymbol,
    fetchedAt: {
      $gte: fromDate,
      $lte: toDate,
    },
  }).sort({ fetchedAt: 1 });
}

async function getPriceForDate(stockSymbol, date) {
  const normalizedSymbol = stockSymbol.toUpperCase().trim();

  const priceRecord = await StockPriceHistory.findOne({
    stockSymbol: normalizedSymbol,
    fetchedAt: { $lte: date },
  }).sort({ fetchedAt: -1 });

  if (priceRecord) {
    return parseFloat(priceRecord.price.toString());
  }

  return await getLatestPrice(normalizedSymbol);
}

function clearPriceCache() {
  latestPrices.clear();
  priceCache.clear();
}

module.exports = {
  getLatestPrice,
  getHistoricalPrices,
  getPriceForDate,
  clearPriceCache,
};
