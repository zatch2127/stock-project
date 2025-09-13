# Stocky Testing Guide

## Overview

This guide provides comprehensive testing strategies for the Stocky stock reward system, covering unit tests, integration tests, load tests, and edge case validation.

---

## Test Setup

### Prerequisites

```bash
npm install --save-dev jest supertest mongodb-memory-server
```

### Test Environment Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: [
    "controllers/**/*.js",
    "models/**/*.js",
    "services/**/*.js",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Test Database Setup

```javascript
// tests/setup.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clean database before each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
```

---

## Unit Tests

### 1. Model Tests

#### RewardEvent Model Tests

```javascript
// tests/models/rewardEvent.test.js
const RewardEvent = require("../../models/rewardEvent");

describe("RewardEvent Model", () => {
  test("should create a valid reward event", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "RELIANCE",
      quantity: 2.5,
      idempotencyKey: "test-key-123",
    };

    const reward = await RewardEvent.create(rewardData);

    expect(reward.userId).toBe("user123");
    expect(reward.stockSymbol).toBe("RELIANCE");
    expect(reward.quantity.toString()).toBe("2.5");
    expect(reward.status).toBe("ACTIVE");
  });

  test("should enforce unique idempotency key", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "RELIANCE",
      quantity: 2.5,
      idempotencyKey: "duplicate-key",
    };

    await RewardEvent.create(rewardData);

    await expect(RewardEvent.create(rewardData)).rejects.toThrow(
      "duplicate key error"
    );
  });

  test("should validate required fields", async () => {
    const invalidReward = {
      userId: "user123",
      // Missing required fields
    };

    await expect(RewardEvent.create(invalidReward)).rejects.toThrow(
      "validation failed"
    );
  });

  test("should handle stock symbol normalization", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "  reliance  ",
      quantity: 2.5,
      idempotencyKey: "test-key-124",
    };

    const reward = await RewardEvent.create(rewardData);
    expect(reward.stockSymbol).toBe("RELIANCE");
  });
});
```

#### LedgerEntry Model Tests

```javascript
// tests/models/ledgerEntry.test.js
const LedgerEntry = require("../../models/ledgerEntry");

describe("LedgerEntry Model", () => {
  test("should create valid ledger entry for stock portfolio", async () => {
    const entryData = {
      transactionId: new mongoose.Types.ObjectId(),
      userId: "user123",
      account: "USER_PORTFOLIO",
      entryType: "CREDIT",
      stockSymbol: "RELIANCE",
      quantity: 2.5,
    };

    const entry = await LedgerEntry.create(entryData);

    expect(entry.account).toBe("USER_PORTFOLIO");
    expect(entry.stockSymbol).toBe("RELIANCE");
    expect(entry.quantity.toString()).toBe("2.5");
  });

  test("should create valid ledger entry for cash account", async () => {
    const entryData = {
      transactionId: new mongoose.Types.ObjectId(),
      userId: "user123",
      account: "COMPANY_CASH",
      entryType: "DEBIT",
      inrAmount: 6250.0,
    };

    const entry = await LedgerEntry.create(entryData);

    expect(entry.account).toBe("COMPANY_CASH");
    expect(entry.inrAmount.toString()).toBe("6250");
  });

  test("should validate account enum values", async () => {
    const invalidEntry = {
      transactionId: new mongoose.Types.ObjectId(),
      userId: "user123",
      account: "INVALID_ACCOUNT",
      entryType: "DEBIT",
      inrAmount: 1000,
    };

    await expect(LedgerEntry.create(invalidEntry)).rejects.toThrow(
      "validation failed"
    );
  });
});
```

### 2. Service Tests

#### Price Service Tests

```javascript
// tests/services/priceService.test.js
const priceService = require("../../services/priceService");

describe("Price Service", () => {
  beforeEach(() => {
    priceService.clearPriceCache();
  });

  test("should return cached price within TTL", async () => {
    const stockSymbol = "RELIANCE";

    // First call
    const price1 = await priceService.getLatestPrice(stockSymbol);

    // Second call within TTL
    const price2 = await priceService.getLatestPrice(stockSymbol);

    expect(price1).toBe(price2);
  });

  test("should generate realistic prices for known stocks", async () => {
    const knownStocks = ["RELIANCE", "TCS", "INFOSYS"];

    for (const stock of knownStocks) {
      const price = await priceService.getLatestPrice(stock);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(10000); // Reasonable upper bound
    }
  });

  test("should handle price API errors gracefully", async () => {
    // Mock external API failure
    jest.spyOn(console, "error").mockImplementation(() => {});

    // This should not throw an error
    const price = await priceService.getLatestPrice("UNKNOWN_STOCK");
    expect(typeof price).toBe("number");
    expect(price).toBeGreaterThan(0);
  });
});
```

#### Corporate Action Service Tests

```javascript
// tests/services/corporateActionService.test.js
const corporateActionService = require("../../services/corporateActionService");
const RewardEvent = require("../../models/rewardEvent");
const StockCorporateAction = require("../../models/stockCorporateAction");

describe("Corporate Action Service", () => {
  test("should process stock split correctly", async () => {
    // Create test reward event
    const rewardEvent = await RewardEvent.create({
      userId: "user123",
      stockSymbol: "RELIANCE",
      quantity: 2.0,
      idempotencyKey: "test-split-1",
    });

    // Create corporate action
    const corporateAction = await StockCorporateAction.create({
      stockSymbol: "RELIANCE",
      actionType: "STOCK_SPLIT",
      effectiveDate: new Date(),
      announcementDate: new Date(),
      details: { from: 1, to: 2 },
      status: "ANNOUNCED",
    });

    // Process the split
    await corporateActionService.processStockSplit(
      "RELIANCE",
      1,
      2,
      new Date()
    );

    // Verify adjustment was created
    const adjustments = await RewardEvent.find({
      userId: "user123",
      stockSymbol: "RELIANCE",
      status: "ADJUSTED",
    });

    expect(adjustments).toHaveLength(1);
    expect(parseFloat(adjustments[0].quantity.toString())).toBe(2.0); // Additional shares
  });

  test("should process merger correctly", async () => {
    // Create test reward event
    await RewardEvent.create({
      userId: "user123",
      stockSymbol: "OLD_STOCK",
      quantity: 4.0,
      idempotencyKey: "test-merger-1",
    });

    // Process merger
    await corporateActionService.processMerger(
      "OLD_STOCK",
      "NEW_STOCK",
      0.5,
      new Date()
    );

    // Verify new stock holdings
    const newHoldings = await RewardEvent.find({
      userId: "user123",
      stockSymbol: "NEW_STOCK",
      status: "ADJUSTED",
    });

    expect(newHoldings).toHaveLength(1);
    expect(parseFloat(newHoldings[0].quantity.toString())).toBe(2.0); // 4.0 * 0.5
  });
});
```

---

## Integration Tests

### 1. API Endpoint Tests

#### Reward Creation Tests

```javascript
// tests/integration/rewards.test.js
const request = require("supertest");
const app = require("../../index");

describe("Reward API Endpoints", () => {
  test("POST /api/rewards should create reward successfully", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "RELIANCE",
      shares: 2.5,
      idempotencyKey: "test-reward-1",
    };

    const response = await request(app)
      .post("/api/rewards")
      .send(rewardData)
      .expect(201);

    expect(response.body.message).toBe("Reward recorded successfully");
    expect(response.body.rewardEvent.userId).toBe("user123");
    expect(response.body.rewardEvent.stockSymbol).toBe("RELIANCE");
    expect(response.body.transactionDetails.inrValue).toBeDefined();
  });

  test("POST /api/rewards should handle duplicate idempotency key", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "RELIANCE",
      shares: 2.5,
      idempotencyKey: "duplicate-test-key",
    };

    // First request
    await request(app).post("/api/rewards").send(rewardData).expect(201);

    // Second request with same idempotency key
    const response = await request(app)
      .post("/api/rewards")
      .send(rewardData)
      .expect(200);

    expect(response.body.message).toBe(
      "Reward already recorded with this idempotency key."
    );
  });

  test("POST /api/rewards should validate required fields", async () => {
    const invalidData = {
      userId: "user123",
      // Missing stockSymbol and shares
    };

    const response = await request(app)
      .post("/api/rewards")
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toContain("Missing required fields");
  });
});
```

#### User Stats Tests

```javascript
// tests/integration/userStats.test.js
describe("User Stats API", () => {
  beforeEach(async () => {
    // Create test data
    await RewardEvent.create([
      {
        userId: "user123",
        stockSymbol: "RELIANCE",
        quantity: 2.0,
        idempotencyKey: "stats-test-1",
        timestamp: new Date(), // Today
      },
      {
        userId: "user123",
        stockSymbol: "TCS",
        quantity: 1.0,
        idempotencyKey: "stats-test-2",
        timestamp: new Date(), // Today
      },
      {
        userId: "user123",
        stockSymbol: "RELIANCE",
        quantity: 1.0,
        idempotencyKey: "stats-test-3",
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      },
    ]);
  });

  test("GET /api/rewards/stats/:userId should return correct stats", async () => {
    const response = await request(app)
      .get("/api/rewards/stats/user123")
      .expect(200);

    expect(response.body.userId).toBe("user123");
    expect(response.body.todayRewardsByStock).toHaveLength(2);
    expect(response.body.currentPortfolioValue).toBeDefined();
    expect(response.body.portfolioDetails).toBeDefined();
  });

  test("GET /api/rewards/today-stocks/:userId should return today's rewards", async () => {
    const response = await request(app)
      .get("/api/rewards/today-stocks/user123")
      .expect(200);

    expect(response.body.userId).toBe("user123");
    expect(response.body.rewards).toHaveLength(2);
    expect(response.body.date).toBeDefined();
  });
});
```

---

## Load Tests

### 1. Performance Tests

#### API Load Testing

```javascript
// tests/load/apiLoad.test.js
const autocannon = require("autocannon");

describe("API Load Tests", () => {
  test("should handle concurrent reward creation", async () => {
    const options = {
      url: "http://localhost:3000",
      connections: 10,
      duration: 30,
      requests: [
        {
          method: "POST",
          path: "/api/rewards",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: "load-test-user",
            stockSymbol: "RELIANCE",
            shares: 1.0,
            idempotencyKey: "load-test-{{id}}",
          }),
        },
      ],
    };

    const result = await autocannon(options);

    expect(result.requests.average).toBeGreaterThan(100); // At least 100 req/s
    expect(result.errors).toBe(0);
  }, 60000); // 60 second timeout
});
```

#### Database Load Testing

```javascript
// tests/load/databaseLoad.test.js
describe("Database Load Tests", () => {
  test("should handle bulk reward creation", async () => {
    const startTime = Date.now();
    const promises = [];

    // Create 1000 rewards concurrently
    for (let i = 0; i < 1000; i++) {
      promises.push(
        RewardEvent.create({
          userId: `user${i % 100}`, // 100 different users
          stockSymbol: "RELIANCE",
          quantity: Math.random() * 10,
          idempotencyKey: `bulk-test-${i}`,
        })
      );
    }

    await Promise.all(promises);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(5000); // Should complete in 5 seconds
  });
});
```

---

## Edge Case Tests

### 1. Duplicate Prevention Tests

```javascript
// tests/edgeCases/duplicates.test.js
describe("Duplicate Prevention", () => {
  test("should prevent duplicate rewards with same idempotency key", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "RELIANCE",
      shares: 2.5,
      idempotencyKey: "duplicate-test-key",
    };

    // Create first reward
    await request(app).post("/api/rewards").send(rewardData).expect(201);

    // Try to create duplicate
    const response = await request(app)
      .post("/api/rewards")
      .send(rewardData)
      .expect(200);

    expect(response.body.message).toContain("already recorded");
  });

  test("should handle race conditions in duplicate prevention", async () => {
    const rewardData = {
      userId: "user123",
      stockSymbol: "RELIANCE",
      shares: 2.5,
      idempotencyKey: "race-condition-test",
    };

    // Send multiple requests simultaneously
    const promises = Array(5)
      .fill()
      .map(() => request(app).post("/api/rewards").send(rewardData));

    const responses = await Promise.all(promises);

    // Only one should succeed, others should return duplicate message
    const successCount = responses.filter((r) => r.status === 201).length;
    const duplicateCount = responses.filter((r) => r.status === 200).length;

    expect(successCount).toBe(1);
    expect(duplicateCount).toBe(4);
  });
});
```

### 2. Corporate Action Tests

```javascript
// tests/edgeCases/corporateActions.test.js
describe("Corporate Actions", () => {
  test("should handle complex stock split scenario", async () => {
    // Create multiple users with different holdings
    const users = ["user1", "user2", "user3"];
    const quantities = [1.0, 2.5, 0.5];

    for (let i = 0; i < users.length; i++) {
      await RewardEvent.create({
        userId: users[i],
        stockSymbol: "RELIANCE",
        quantity: quantities[i],
        idempotencyKey: `split-test-${i}`,
      });
    }

    // Process 1:2 stock split
    await corporateActionService.processStockSplit(
      "RELIANCE",
      1,
      2,
      new Date()
    );

    // Verify all users got correct adjustments
    for (let i = 0; i < users.length; i++) {
      const adjustments = await RewardEvent.find({
        userId: users[i],
        stockSymbol: "RELIANCE",
        status: "ADJUSTED",
      });

      expect(adjustments).toHaveLength(1);
      expect(parseFloat(adjustments[0].quantity.toString())).toBe(
        quantities[i]
      );
    }
  });
});
```

---

## Test Data Management

### 1. Test Data Factories

```javascript
// tests/factories/rewardFactory.js
class RewardFactory {
  static create(overrides = {}) {
    return {
      userId: "test-user",
      stockSymbol: "RELIANCE",
      shares: 1.0,
      idempotencyKey: `test-${Date.now()}-${Math.random()}`,
      ...overrides,
    };
  }

  static createBulk(count, overrides = {}) {
    return Array(count)
      .fill()
      .map((_, index) =>
        this.create({
          userId: `user${index}`,
          idempotencyKey: `bulk-test-${index}`,
          ...overrides,
        })
      );
  }
}

module.exports = RewardFactory;
```

### 2. Test Database Seeding

```javascript
// tests/seed/testData.js
const seedTestData = async () => {
  // Create test users with various holdings
  const testUsers = [
    { userId: "user1", holdings: [{ symbol: "RELIANCE", quantity: 5.0 }] },
    { userId: "user2", holdings: [{ symbol: "TCS", quantity: 2.5 }] },
    {
      userId: "user3",
      holdings: [
        { symbol: "RELIANCE", quantity: 1.0 },
        { symbol: "INFOSYS", quantity: 3.0 },
      ],
    },
  ];

  for (const user of testUsers) {
    for (const holding of user.holdings) {
      await RewardEvent.create({
        userId: user.userId,
        stockSymbol: holding.symbol,
        quantity: holding.quantity,
        idempotencyKey: `seed-${user.userId}-${holding.symbol}`,
      });
    }
  }
};
```

---

## Test Execution

### 1. Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=unit

# Run with coverage
npm test -- --coverage

# Run load tests
npm test -- --testPathPattern=load
```

### 2. Continuous Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: "18"
      - run: npm ci
      - run: npm test
      - run: npm run test:load
```

---

## Test Coverage Goals

- **Unit Tests**: 90%+ coverage for models and services
- **Integration Tests**: 80%+ coverage for API endpoints
- **Edge Cases**: 100% coverage for critical business logic
- **Load Tests**: Validate performance under expected load

This comprehensive testing strategy ensures the Stocky system is robust, reliable, and ready for production deployment.


