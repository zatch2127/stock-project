const mongoose = require("mongoose");
const RewardEvent = require("./models/rewardEvent");
const StockPriceHistory = require("./models/stockPriceHistory");

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/stocky", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function debugHistorical() {
  try {
    console.log("🔍 Debugging historical data...\n");

    // Get user1 reward events
    const rewardEvents = await RewardEvent.find({ userId: "user1" })
      .sort({ timestamp: 1 })
      .lean();

    console.log(`📊 Found ${rewardEvents.length} reward events for user1\n`);

    for (let i = 0; i < rewardEvents.length; i++) {
      const event = rewardEvents[i];
      console.log(`--- Event ${i + 1} ---`);
      console.log(`ID: ${event._id}`);
      console.log(`Stock: ${event.stockSymbol}`);
      console.log(`Quantity: ${event.quantity}`);
      console.log(`Timestamp: ${event.timestamp}`);
      console.log(`Timestamp type: ${typeof event.timestamp}`);

      // Test date parsing
      try {
        const testDate = new Date(event.timestamp);
        console.log(`Parsed date: ${testDate}`);
        console.log(`Is valid: ${!isNaN(testDate.getTime())}`);

        if (!isNaN(testDate.getTime())) {
          testDate.setHours(0, 0, 0, 0);
          const dateKey = testDate.toISOString().split("T")[0];
          console.log(`Date key: ${dateKey}`);
        }
      } catch (error) {
        console.log(`❌ Date parsing error: ${error.message}`);
      }

      // Check for price data
      const priceRecord = await StockPriceHistory.findOne({
        stockSymbol: event.stockSymbol,
        fetchedAt: { $lte: new Date(event.timestamp) },
      }).sort({ fetchedAt: -1 });

      if (priceRecord) {
        console.log(
          `✅ Found price: ₹${priceRecord.price} on ${priceRecord.fetchedAt}`
        );
      } else {
        console.log(`❌ No price found for ${event.stockSymbol}`);
      }

      console.log(""); 
    }

    console.log("✅ Debug complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Debug error:", error);
    process.exit(1);
  }
}

debugHistorical();
