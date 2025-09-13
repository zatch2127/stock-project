const mongoose = require("mongoose");
const RewardEvent = require("../models/rewardEvent");
const LedgerEntry = require("../models/ledgerEntry");
const StockPriceHistory = require("../models/stockPriceHistory");
const priceService = require("../services/priceService");

exports.createReward = async (req, res) => {
  try {
    const { userId, stockSymbol, shares, timestamp, idempotencyKey } = req.body;

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

    if (idempotencyKey) {
      const existingReward = await RewardEvent.findOne({ idempotencyKey });
      if (existingReward) {
        return res.status(200).json({
          message: "Reward already recorded with this idempotency key.",
          rewardEvent: existingReward,
        });
      }
    }

    const rewardEvent = await RewardEvent.create({
      userId,
      stockSymbol,
      quantity: parsedShares,
      timestamp: timestamp || new Date(),
      idempotencyKey,
    });

    const currentPrice = await priceService.getLatestPrice(stockSymbol);

    const price = parseFloat(currentPrice);
    if (isNaN(price) || price <= 0) {
      throw new Error("Invalid stock price fetched.");
    }

    const inrValue = parseFloat(shares) * price;

    const brokerageRate = 0.001;
    const sttRate = 0.00025;
    const gstRate = 0.18;

    const brokerage = inrValue * brokerageRate;
    const stt = inrValue * sttRate;
    const gst = brokerage * gstRate;

    const totalFees = brokerage + stt + gst;

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "COMPANY_CASH",
      entryType: "DEBIT",
      stockSymbol: stockSymbol,
      quantity: shares,
      inrAmount: inrValue,
      description: `Purchase of ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "BROKERAGE_EXPENSE",
      entryType: "DEBIT",
      inrAmount: brokerage,
      description: `Brokerage for ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "STT_EXPENSE",
      entryType: "DEBIT",
      inrAmount: stt,
      description: `STT for ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "GST_EXPENSE",
      entryType: "DEBIT",
      inrAmount: gst,
      description: `GST for ${shares} shares of ${stockSymbol} for user ${userId}`,
      timestamp: rewardEvent.timestamp,
    });

    await LedgerEntry.create({
      transactionId: rewardEvent._id,
      userId,
      account: "USER_PORTFOLIO",
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
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getTodaysRewardsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const rewards = await RewardEvent.find({
      userId,
      timestamp: {
        $gte: today,
        $lt: tomorrow,
      },
    }).lean();

    res
      .status(200)
      .json({ userId, date: today.toISOString().split("T")[0], rewards });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getHistoricalInr = async (req, res) => {
  try {
    const { userId } = req.params;
    const rewardEvents = await RewardEvent.find({ userId })
      .sort({ timestamp: 1 })
      .lean();

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
      let eventTimestamp;
      if (typeof event.timestamp === "string") {
        eventTimestamp = new Date(event.timestamp);
      } else if (event.timestamp instanceof Date) {
        eventTimestamp = new Date(event.timestamp.getTime());
      } else {
        continue;
      }

      if (isNaN(eventTimestamp.getTime())) {
        continue;
      }

      const eventDate = new Date(eventTimestamp);
      const dateKey = eventDate.toISOString().split("T")[0];

      let priceRecord = await StockPriceHistory.findOne({
        stockSymbol: event.stockSymbol,
        fetchedAt: { $lte: eventTimestamp },
      })
        .sort({ fetchedAt: -1 })
        .lean();

      let price = 0;
      if (priceRecord && priceRecord.price) {
        price = parseFloat(priceRecord.price.toString());
      } else {
        try {
          price = await priceService.getLatestPrice(event.stockSymbol);
        } catch (error) {
          price = 0;
        }
      }

      const quantity = parseFloat(event.quantity.toString());
      const inrValue = quantity * price;

      if (!historicalData[dateKey]) {
        historicalData[dateKey] = 0;
      }
      historicalData[dateKey] += inrValue;
    }

    const result = Object.keys(historicalData)
      .map((date) => ({
        date,
        totalInrValue: historicalData[date].toFixed(4),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

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
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const { userId } = req.params;

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
          totalShares: { $toString: "$totalShares" },
        },
      },
    ]);

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
      const shares = parseFloat(holding.totalShares.toString());

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
      portfolioDetails,
    });
  } catch (error) {
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
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = exports;
