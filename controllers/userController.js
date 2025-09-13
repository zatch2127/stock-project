const LedgerEntry = require("../models/ledgerEntry");
const RewardEvent = require("../models/rewardEvent");
const priceService = require("../services/priceService");

exports.getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayRewardsByStock = await RewardEvent.aggregate([
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
      if (!stockSymbol) {
        console.warn(
          `Skipping holding with null stockSymbol for userId: ${userId}`
        );
        continue;
      }

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
      todayRewardsByStock,
      currentPortfolioValue: currentPortfolioValue.toFixed(4),
      portfolioDetails,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getUserHistoricalInr = async (req, res) => {
  const { userId } = req.params;

  try {
    console.log(`Getting historical INR for user: ${userId}`);

    const rewardEvents = await RewardEvent.find({
      userId: userId,
      status: "ACTIVE",
    }).sort({ timestamp: 1 });

    console.log(
      `Found ${rewardEvents.length} reward events for user ${userId}`
    );

    if (rewardEvents.length === 0) {
      return res.status(200).json({
        userId: userId,
        historicalInrValue: [],
        message: "No historical data available",
      });
    }

    const dailyTotals = {};

    for (const event of rewardEvents) {
      console.log(`Processing RewardEvent:`, {
        _id: event._id,
        userId: event.userId,
        stockSymbol: event.stockSymbol,
        quantity: event.quantity,
        timestamp: event.timestamp,
        idempotencyKey: event.idempotencyKey,
        status: event.status,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        __v: event.__v,
      });

      let eventTimestamp;
      if (typeof event.timestamp === "string") {
        eventTimestamp = new Date(event.timestamp);
      } else if (event.timestamp instanceof Date) {
        eventTimestamp = new Date(event.timestamp.getTime());
      } else {
        console.error("Invalid timestamp format:", event.timestamp);
        continue;
      }

      if (isNaN(eventTimestamp.getTime())) {
        console.error(
          "Invalid timestamp for event:",
          event._id,
          event.timestamp
        );
        continue;
      }

      const eventDate = new Date(eventTimestamp);
      const dateKey = eventDate.toISOString().split("T")[0];

      console.log(`Date key for ${event.stockSymbol}: ${dateKey}`);

      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = 0;
      }

      let price;
      try {
        const StockPriceHistory = require("../models/stockPriceHistory");
        const historicalPrice = await StockPriceHistory.findOne({
          stockSymbol: event.stockSymbol,
          date: { $lte: eventTimestamp },
        }).sort({ date: -1 });

        if (historicalPrice) {
          price = parseFloat(historicalPrice.price.toString());
          console.log(
            `Found historical price for ${event.stockSymbol}: ₹${price}`
          );
        } else {
          price = await priceService.getLatestPrice(event.stockSymbol);
          console.log(
            `No historical price found for ${event.stockSymbol} on or before ${eventTimestamp}`
          );
          console.log(
            `Using current price as fallback for ${event.stockSymbol}: ${price}`
          );
        }
      } catch (priceError) {
        console.error(
          `Error getting price for ${event.stockSymbol}:`,
          priceError.message
        );
        continue;
      }

      if (price && !isNaN(price) && price > 0) {
        const quantity = parseFloat(event.quantity.toString());
        const inrValue = quantity * price;
        dailyTotals[dateKey] += inrValue;

        console.log(
          `Calculated INR Value: ${quantity} shares × ₹${price} = ₹${inrValue}`
        );
      }
    }

    const result = Object.keys(dailyTotals)
      .map((date) => ({
        date: date,
        totalInrValue: dailyTotals[date].toFixed(4),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`Final result for ${userId}:`, result);

    res.status(200).json({
      userId: userId,
      historicalInrValue: result,
      message:
        result.length > 0
          ? "Historical data retrieved successfully"
          : "No historical data available",
    });
  } catch (error) {
    console.error("Error in getUserHistoricalInr:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
