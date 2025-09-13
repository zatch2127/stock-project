const mongoose = require("mongoose");
const RewardEvent = require("../models/rewardEvent");
const LedgerEntry = require("../models/ledgerEntry");
const StockPriceHistory = require("../models/stockPriceHistory"); // Keep for historical price lookups
const priceService = require("../services/priceService"); // Import the price service

exports.createReward = async (req, res) => {
  console.log("Received request body:", req.body); // Log the received body
  try {
    const { userId, stockSymbol, shares, timestamp, idempotencyKey } = req.body;

    // Basic validation for required fields
    if (!userId || !stockSymbol || shares === undefined || shares === null) {
      return res.status(400).json({
        message:
          "Missing required fields: userId, stockSymbol, and shares are mandatory.",
      });
    }

    const parsedShares = parseFloat(shares);
    if (isNaN(parsedShares) || parsedShares <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid shares value. Must be a positive number." });
    }

    // Handle duplicate reward events / replay attacks using idempotencyKey
    if (idempotencyKey) {
      const existingReward = await RewardEvent.findOne({ idempotencyKey });
      if (existingReward) {
        return res.status(200).json({
          message: "Reward already recorded with this idempotency key.",
          rewardEvent: existingReward,
        });
      }
    }

    // 1. Record the reward event
    const rewardEvent = await RewardEvent.create({
      userId,
      stockSymbol,
      quantity: parsedShares, // Use parsedShares
      timestamp: timestamp || new Date(), // Use provided timestamp or current
      idempotencyKey, // Save idempotency key
    });

    // 2. Fetch current price using the price service
    const currentPrice = await priceService.getLatestPrice(stockSymbol);

    // Ensure currentPrice is a number for calculations
    const price = parseFloat(currentPrice);
    if (isNaN(price) || price <= 0) {
      throw new Error("Invalid stock price fetched.");
    }

    const inrValue = parseFloat(shares) * price;

    // Example fees (simplified) - these are percentages of the INR value
    const brokerageRate = 0.001; // 0.1%
    const sttRate = 0.00025; // 0.025%
    const gstRate = 0.18; // 18% on brokerage

    const brokerage = inrValue * brokerageRate;
    const stt = inrValue * sttRate;
    const gst = brokerage * gstRate; // GST is on brokerage

    const totalFees = brokerage + stt + gst;

    // Record cash outflow for stock purchase
    await LedgerEntry.create({
      transactionId: rewardEvent._id, // Link ledger entries to the reward event
      userId,
      account: "COMPANY_CASH", // Company's cash account
      entryType: "DEBIT",
      stockSymbol: stockSymbol,
      quantity: shares, // Record stock units in ledger for stock account
      inrAmount: inrValue, // Record INR value for cash account
      description: `Purchase of ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    // Record cash outflow for fees
    await LedgerEntry.create({
      transactionId: rewardEvent._id, // Link ledger entries to the reward event
      userId,
      account: "BROKERAGE_EXPENSE", // Company's expense account for brokerage
      entryType: "DEBIT",
      inrAmount: brokerage,
      description: `Brokerage for ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "STT_EXPENSE", // Company's expense account for STT
      entryType: "DEBIT",
      inrAmount: stt,
      description: `STT for ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "GST_EXPENSE", // Company's expense account for GST
      entryType: "DEBIT",
      inrAmount: gst,
      description: `GST for ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    // Credit user's portfolio with stock units
    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "USER_PORTFOLIO", // User's stock portfolio account
      entryType: "CREDIT",
      stockSymbol: stockSymbol,
      quantity: shares,
      description: `Credit ${shares} shares of ${stockSymbol} to user ${userId}'s portfolio`,
      timestamp: rewardEvent.timestamp,
    });

    res.status(201).json({
      message: "Reward recorded successfully",
      rewardEvent: {
        _id: rewardEvent._id,
        userId: rewardEvent.userId,
        stockSymbol: rewardEvent.stockSymbol,
        quantity: rewardEvent.quantity,
        timestamp: rewardEvent.timestamp,
        idempotencyKey: rewardEvent.idempotencyKey,
      },
      transactionDetails: {
        inrValue: inrValue.toFixed(4),
        fees: {
          brokerage: brokerage.toFixed(4),
          stt: stt.toFixed(4),
          gst: gst.toFixed(4),
          total: totalFees.toFixed(4),
        },
      },
    });
  } catch (error) {
    console.error("Error recording reward:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getTodaysRewardsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

    const rewards = await RewardEvent.find({
      userId,
      timestamp: {
        $gte: today,
        $lt: tomorrow,
      },
    }).lean(); // .lean() for plain JavaScript objects

    res
      .status(200)
      .json({ userId, date: today.toISOString().split("T")[0], rewards });
  } catch (error) {
    console.error("Error fetching today's rewards:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getHistoricalInr = async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch all reward events for the user
    const rewardEvents = await RewardEvent.find({ userId })
      .sort({ timestamp: 1 })
      .lean();

    console.log(
      `Found ${rewardEvents.length} reward events for user ${userId}`
    );

    // If no reward events, return empty array with informative message
    if (rewardEvents.length === 0) {
      return res.status(200).json({
        userId,
        message: "No reward events found for this user",
        historicalInrValue: [],
      });
    }

    const historicalData = {};
    const priceService = require("../services/priceService");

    for (const event of rewardEvents) {
      console.log("Processing RewardEvent:", event);

      // Safely handle timestamp - it might be a string or Date object
      let eventTimestamp;
      if (typeof event.timestamp === "string") {
        eventTimestamp = new Date(event.timestamp);
      } else if (event.timestamp instanceof Date) {
        eventTimestamp = new Date(event.timestamp.getTime());
      } else {
        console.error("Invalid timestamp format:", event.timestamp);
        continue; // Skip this event
      }

      // Check if the date is valid
      if (isNaN(eventTimestamp.getTime())) {
        console.error(
          "Invalid timestamp for event:",
          event._id,
          event.timestamp
        );
        continue; // Skip this event
      }

      // Create date key using UTC to avoid timezone issues
      const eventDate = new Date(eventTimestamp);
      const dateKey = eventDate.toISOString().split("T")[0]; // YYYY-MM-DD (UTC)
      console.log(`Date key for ${event.stockSymbol}: ${dateKey}`);

      // Try to get price from StockPriceHistory first
      let priceRecord = await StockPriceHistory.findOne({
        stockSymbol: event.stockSymbol,
        fetchedAt: { $lte: eventTimestamp }, // Find price recorded on or before the event
      })
        .sort({ fetchedAt: -1 })
        .lean(); // Get the latest price before/on event

      let price = 0;
      if (priceRecord && priceRecord.price) {
        price = parseFloat(priceRecord.price.toString());
        console.log(
          `Found historical price for ${event.stockSymbol}: ${price}`
        );
      } else {
        // If no historical price found, try to get current price as fallback
        console.warn(
          `No historical price found for ${event.stockSymbol} on or before ${eventTimestamp}`
        );
        try {
          price = await priceService.getLatestPrice(event.stockSymbol);
          console.log(
            `Using current price as fallback for ${event.stockSymbol}: ${price}`
          );
        } catch (error) {
          console.error(`Failed to get price for ${event.stockSymbol}:`, error);
          price = 0;
        }
      }

      const quantity = parseFloat(event.quantity.toString());
      const inrValue = quantity * price;
      console.log(
        `Calculated INR Value: ${quantity} shares × ₹${price} = ₹${inrValue}`
      );

      if (!historicalData[dateKey]) {
        historicalData[dateKey] = 0;
      }
      historicalData[dateKey] += inrValue;
    }

    // Convert to array of objects for easier consumption
    const result = Object.keys(historicalData)
      .map((date) => ({
        date,
        totalInrValue: historicalData[date].toFixed(4),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`Final result for ${userId}:`, result);

    res.status(200).json({
      userId,
      historicalInrValue: result,
      totalEvents: rewardEvents.length,
      message:
        result.length > 0
          ? "Historical data retrieved successfully"
          : "No historical data available",
    });
  } catch (error) {
    console.error("Error fetching historical INR value:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const { userId } = req.params;

    // Total shares rewarded today (grouped by stock symbol)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayRewards = await RewardEvent.aggregate([
      {
        $match: {
          userId,
          timestamp: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: "$stockSymbol",
          totalShares: { $sum: "$quantity" },
        },
      },
      {
        $project: {
          _id: 0,
          stockSymbol: "$_id",
          totalShares: { $toString: "$totalShares" }, // Convert Decimal128 to string
        },
      },
    ]);

    // Current INR value of the user's portfolio
    const userHoldings = await RewardEvent.aggregate([
      {
        $match: { userId },
      },
      {
        $group: {
          _id: "$stockSymbol",
          totalShares: { $sum: "$quantity" },
        },
      },
      {
        $project: {
          _id: 0,
          stockSymbol: "$_id",
          totalShares: "$totalShares",
        },
      },
    ]);

    let currentPortfolioValue = 0;
    const portfolioDetails = [];

    for (const holding of userHoldings) {
      const stockSymbol = holding.stockSymbol;
      const shares = parseFloat(holding.totalShares.toString()); // Convert Decimal128 to float

      const currentPrice = await priceService.getLatestPrice(stockSymbol);
      const price = parseFloat(currentPrice);

      if (!isNaN(price) && price > 0) {
        const value = shares * price;
        currentPortfolioValue += value;
        portfolioDetails.push({
          stockSymbol,
          shares: shares.toFixed(6),
          currentPrice: price.toFixed(4),
          currentValue: value.toFixed(4),
        });
      }
    }

    res.status(200).json({
      userId,
      todayRewardsByStock: todayRewards,
      currentPortfolioValue: currentPortfolioValue.toFixed(4),
      portfolioDetails, // Bonus: detailed portfolio
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getPortfolio = async (req, res) => {
  try {
    const { userId } = req.params;

    const userHoldings = await RewardEvent.aggregate([
      {
        $match: { userId },
      },
      {
        $group: {
          _id: "$stockSymbol",
          totalShares: { $sum: "$quantity" },
        },
      },
      {
        $project: {
          _id: 0,
          stockSymbol: "$_id",
          totalShares: "$totalShares",
        },
      },
    ]);

    const portfolio = [];
    let totalPortfolioValue = 0;

    for (const holding of userHoldings) {
      const stockSymbol = holding.stockSymbol;
      const shares = parseFloat(holding.totalShares.toString());

      const currentPrice = await priceService.getLatestPrice(stockSymbol);
      const price = parseFloat(currentPrice);

      if (!isNaN(price) && price > 0) {
        const value = shares * price;
        totalPortfolioValue += value;
        portfolio.push({
          stockSymbol,
          shares: shares.toFixed(6),
          currentPrice: price.toFixed(4),
          currentValue: value.toFixed(4),
        });
      }
    }

    res.status(200).json({
      userId,
      portfolio,
      totalPortfolioValue: totalPortfolioValue.toFixed(4),
    });
  } catch (error) {
    console.error("Error fetching user portfolio:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = exports;
