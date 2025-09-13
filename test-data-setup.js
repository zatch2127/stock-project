const mongoose = require("mongoose");
const RewardEvent = require("./models/rewardEvent");
const StockPriceHistory = require("./models/stockPriceHistory");
const priceService = require("./services/priceService");

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/stocky", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function setupTestData() {
  try {
    console.log("Setting up test data...");

    
    await RewardEvent.deleteMany({});
    await StockPriceHistory.deleteMany({});
    console.log("Cleared existing data");

  
    const sampleRewards = [
      {
        userId: "user1",
        stockSymbol: "RELIANCE",
        quantity: 2.5,
        idempotencyKey: "test-reward-1",
        timestamp: new Date("2024-01-15T10:30:00Z"),
        notes: "Onboarding bonus",
      },
      {
        userId: "user1",
        stockSymbol: "TCS",
        quantity: 1.0,
        idempotencyKey: "test-reward-2",
        timestamp: new Date("2024-01-16T14:20:00Z"),
        notes: "Referral bonus",
      },
      {
        userId: "user1",
        stockSymbol: "INFOSYS",
        quantity: 3.0,
        idempotencyKey: "test-reward-3",
        timestamp: new Date("2024-01-17T09:15:00Z"),
        notes: "Trading milestone",
      },
      {
        userId: "user2",
        stockSymbol: "RELIANCE",
        quantity: 1.5,
        idempotencyKey: "test-reward-4",
        timestamp: new Date("2024-01-15T11:00:00Z"),
        notes: "Onboarding bonus",
      },
    ];

  
    for (const reward of sampleRewards) {
      await RewardEvent.create(reward);
      console.log(
        `Created reward: ${reward.userId} - ${reward.stockSymbol} - ${reward.quantity} shares`
      );
    }

    // Create some historical price data
    const stockSymbols = ["RELIANCE", "TCS", "INFOSYS"];
    const dates = [
      new Date("2024-01-15T09:00:00Z"),
      new Date("2024-01-16T09:00:00Z"),
      new Date("2024-01-17T09:00:00Z"),
      new Date("2024-01-18T09:00:00Z"),
    ];

    for (const symbol of stockSymbols) {
      for (const date of dates) {
        const basePrice =
          symbol === "RELIANCE" ? 2500 : symbol === "TCS" ? 3500 : 1500;
        const variation = (Math.random() - 0.5) * 0.1; 
        const price = basePrice * (1 + variation);

        await StockPriceHistory.create({
          stockSymbol: symbol,
          price: price,
          fetchedAt: date,
        });
      }
      console.log(`Created price history for ${symbol}`);
    }

    for (const symbol of stockSymbols) {
      await priceService.getLatestPrice(symbol);
      console.log(`Created current price for ${symbol}`);
    }

    console.log("\n✅ Test data setup complete!");
    console.log("\nYou can now test the API endpoints:");
    console.log("- GET /api/rewards/today-stocks/user1");
    console.log("- GET /api/rewards/historical-inr/user1");
    console.log("- GET /api/rewards/stats/user1");
    console.log("- GET /api/rewards/portfolio/user1");

    process.exit(0);
  } catch (error) {
    console.error("Error setting up test data:", error);
    process.exit(1);
  }
}

setupTestData();
