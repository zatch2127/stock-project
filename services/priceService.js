const StockPriceHistory = require("../models/stockPriceHistory");

// In-memory cache for latest prices to reduce database lookups
const latestPrices = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const priceCache = new Map(); // Store price with timestamp

// Base prices for major Indian stocks (for more realistic simulation)
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

/**
 * Simulates fetching the latest price for a stock symbol.
 * In a real application, this would call an external market data API.
 * For this project, it returns a realistic price based on historical patterns.
 * @param {string} stockSymbol - The stock symbol (e.g., 'RELIANCE').
 * @returns {Promise<number>} The latest price.
 */
async function getLatestPrice(stockSymbol) {
  const normalizedSymbol = stockSymbol.toUpperCase().trim();

  // Check cache first
  const cached = priceCache.get(normalizedSymbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
    // Try to get the most recent price from database first
    const lastPrice = await StockPriceHistory.findOne({
      stockSymbol: normalizedSymbol,
    }).sort({ fetchedAt: -1 });

    let price;
    if (lastPrice) {
      // Add some realistic volatility (±2%)
      const basePrice = parseFloat(lastPrice.price.toString());
      const volatility = (Math.random() - 0.5) * 0.04; // ±2%
      price = basePrice * (1 + volatility);
    } else {
      // Generate a new price based on base prices
      const basePrice = BASE_PRICES[normalizedSymbol] || 1000;
      const volatility = (Math.random() - 0.5) * 0.1; // ±5%
      price = basePrice * (1 + volatility);
    }

    // Ensure price is positive and reasonable
    price = Math.max(price, 1);
    price = parseFloat(price.toFixed(4));

    // Update cache
    priceCache.set(normalizedSymbol, {
      price,
      timestamp: Date.now(),
    });

    // Persist to database
    await StockPriceHistory.create({
      stockSymbol: normalizedSymbol,
      price: price,
    });

    return price;
  } catch (error) {
    console.error(`Error fetching price for ${normalizedSymbol}:`, error);

    // Fallback to cached price if available
    if (cached) {
      return cached.price;
    }

    // Final fallback
    throw new Error(`Unable to fetch price for ${normalizedSymbol}`);
  }
}

/**
 * Get historical prices for a stock symbol
 * @param {string} stockSymbol - The stock symbol
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @returns {Promise<Array>} Array of price records
 */
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

/**
 * Get price for a specific date (or closest available)
 * @param {string} stockSymbol - The stock symbol
 * @param {Date} date - The date
 * @returns {Promise<number>} The price
 */
async function getPriceForDate(stockSymbol, date) {
  const normalizedSymbol = stockSymbol.toUpperCase().trim();

  const priceRecord = await StockPriceHistory.findOne({
    stockSymbol: normalizedSymbol,
    fetchedAt: { $lte: date },
  }).sort({ fetchedAt: -1 });

  if (priceRecord) {
    return parseFloat(priceRecord.price.toString());
  }

  // If no historical price found, generate one
  return await getLatestPrice(normalizedSymbol);
}

/**
 * Clear price cache (useful for testing)
 */
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
