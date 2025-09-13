const mongoose = require("mongoose");
const RewardEvent = require("./models/rewardEvent");
const StockPriceHistory = require("./models/stockPriceHistory");

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/stocky", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function checkData() {
  try {
    console.log("Checking database data...\n");

    // Check reward events
    const rewardEvents = await RewardEvent.find({});
    console.log(`📊 Total Reward Events: ${rewardEvents.length}`);

    if (rewardEvents.length > 0) {
      console.log("\n📋 Sample Reward Events:");
      rewardEvents.slice(0, 3).forEach((event, index) => {
        console.log(
          `${index + 1}. User: ${event.userId}, Stock: ${
            event.stockSymbol
          }, Quantity: ${event.quantity}, Date: ${event.timestamp}`
        );
      });
    }

    // Check price history
    const priceHistory = await StockPriceHistory.find({});
    console.log(`\n💰 Total Price Records: ${priceHistory.length}`);

    if (priceHistory.length > 0) {
      console.log("\n📈 Sample Price Records:");
      priceHistory.slice(0, 3).forEach((price, index) => {
        console.log(
          `${index + 1}. Stock: ${price.stockSymbol}, Price: ₹${
            price.price
          }, Date: ${price.fetchedAt}`
        );
      });
    }

    // Check specific user data
    const user1Events = await RewardEvent.find({ userId: "user1" });
    console.log(`\n👤 Reward Events for user1: ${user1Events.length}`);

    if (user1Events.length > 0) {
      console.log("\n📋 user1 Reward Events:");
      user1Events.forEach((event, index) => {
        console.log(
          `${index + 1}. Stock: ${event.stockSymbol}, Quantity: ${
            event.quantity
          }, Date: ${event.timestamp}`
        );
      });
    } else {
      console.log("\n❌ No reward events found for user1");
      console.log("💡 Run: node test-data-setup.js to create sample data");
    }

    console.log("\n✅ Data check complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error checking data:", error);
    process.exit(1);
  }
}

checkData();
