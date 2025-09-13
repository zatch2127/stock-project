# Edge Cases and Scaling Considerations

## Edge Cases Handled

### 1. Duplicate Reward Events / Replay Attacks

**Problem**: Preventing duplicate processing of the same reward event.

**Solution**:

- **Idempotency Keys**: Each reward request includes a unique `idempotencyKey`
- **Database Constraint**: Unique index on `idempotencyKey` field
- **Response Handling**: Returns existing reward if duplicate key detected

```javascript
// Example implementation
if (idempotencyKey) {
  const existingReward = await RewardEvent.findOne({ idempotencyKey });
  if (existingReward) {
    return res.status(200).json({
      message: "Reward already recorded",
      rewardEvent: existingReward,
    });
  }
}
```

**Best Practices**:

- Use timestamp + user + sequence format: `reward_user123_reliance_20240115_001`
- Include request hash for additional uniqueness
- Implement cleanup job for old idempotency keys

---

### 2. Stock Splits, Mergers, and Delisting

**Problem**: Corporate actions that affect existing holdings.
 
**Solution**:

- **Corporate Action Tracking**: `StockCorporateAction` model tracks all corporate events
- **Automatic Processing**: Service processes pending actions based on effective dates
- **Adjustment Records**: Creates adjustment entries linked to original rewards

#### Stock Split Example (1:2 split)

```javascript
// Original: 2.5 shares of RELIANCE
// After split: 5.0 shares of RELIANCE
// Adjustment: +2.5 shares

const adjustmentEvent = await RewardEvent.create({
  userId: event.userId,
  stockSymbol: "RELIANCE",
  quantity: 2.5, // Additional shares
  status: "ADJUSTED",
  adjustmentReason: "STOCK_SPLIT",
  parentRewardId: originalEvent._id,
});
```

#### Merger Example (RELIANCE → NEWCO, 1:0npm .5 ratio)

```javascript
// Original: 2.5 shares of RELIANCE
// After merger: 1.25 shares of NEWCO
// Debit: -2.5 RELIANCE, Credit: +1.25 NEWCO
```

#### Delisting Example

```javascript
// Original: 2.5 shares of DELISTED_STOCK at ₹100
// Compensation: ₹250 cash
// Debit: -2.5 shares, Credit: +₹250 cash
```

---

### 3. Rounding Errors in INR Valuation

**Problem**: Floating-point arithmetic can cause rounding errors.

**Solution**:

- **Decimal128**: Use MongoDB's `Decimal128` for precise decimal arithmetic
- **Rounding Strategy**: Round to 4 decimal places for INR amounts
- **Validation**: Check transaction balance within acceptable tolerance

```javascript
// Rounding to 4 decimal places
const inrValue = parseFloat((shares * price).toFixed(4));

// Balance validation with tolerance
const tolerance = 0.0001;
return Math.abs(balance) < tolerance;
```

---

### 4. Price API Downtime or Stale Data

**Problem**: External price service unavailable or returns stale data.

**Solution**:

- **Caching**: 5-minute cache for price data
- **Fallback Strategy**: Use last known price if API fails
- **Error Handling**: Graceful degradation with user notification

```javascript
async function getLatestPrice(stockSymbol) {
  try {
    // Try to get fresh price
    const price = await externalPriceAPI.getPrice(stockSymbol);
    return price;
  } catch (error) {
    // Fallback to cached price
    const cachedPrice = await getCachedPrice(stockSymbol);
    if (cachedPrice) {
      console.warn(`Using cached price for ${stockSymbol}`);
      return cachedPrice;
    }
    throw new Error(`Unable to fetch price for ${stockSymbol}`);
  }
}
```

---

### 5. Adjustments and Refunds

**Problem**: Need to adjust or refund previously given rewards.

**Solution**:

- **Status Tracking**: `ACTIVE`, `ADJUSTED`, `CANCELLED`, `REFUNDED` statuses
- **Adjustment Records**: Link adjustments to original rewards
- **Audit Trail**: Complete history of all changes

```javascript
// Refund example
const refundEvent = await RewardEvent.create({
  userId: originalEvent.userId,
  stockSymbol: originalEvent.stockSymbol,
  quantity: -originalEvent.quantity, // Negative quantity
  status: "REFUNDED",
  parentRewardId: originalEvent._id,
  adjustmentReason: "REFUND",
});
```

---

## Scaling Considerations

### 1. Database Scaling

#### Horizontal Scaling (Sharding)

```javascript
// Shard by userId for user-specific queries
shardKey: {
  userId: 1;
}

// Shard by stockSymbol for price data
shardKey: {
  stockSymbol: 1;
}
```

#### Vertical Scaling

- **Index Optimization**: Compound indexes for common query patterns
- **Connection Pooling**: Limit concurrent connections
- **Query Optimization**: Use projection to limit returned fields

#### Data Archiving

```javascript
// Archive old price data (keep last 2 years)
const archiveDate = new Date();
archiveDate.setFullYear(archiveDate.getFullYear() - 2);

await StockPriceHistory.deleteMany({
  fetchedAt: { $lt: archiveDate },
});
```

### 2. Application Scaling

#### Microservices Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Reward API    │    │   Price Service │    │  Ledger Service │
│                 │    │                 │    │                 │
│ - Create reward │    │ - Fetch prices  │    │ - Book entries  │
│ - Get stats     │    │ - Cache prices  │    │ - Validate      │
│ - Get portfolio │    │ - Handle errors │    │ - Reconcile     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### Load Balancing

- **API Gateway**: Route requests to multiple instances
- **Database Replicas**: Read from secondary replicas
- **Caching Layer**: Redis for frequently accessed data

### 3. Performance Optimization

#### Caching Strategy

```javascript
// Multi-level caching
1. In-memory cache (5 minutes)
2. Redis cache (1 hour)
3. Database (persistent)
```

#### Batch Processing

```javascript
// Process corporate actions in batches
const batchSize = 100;
const pendingActions = await getPendingCorporateActions();

for (let i = 0; i < pendingActions.length; i += batchSize) {
  const batch = pendingActions.slice(i, i + batchSize);
  await processBatch(batch);
}
```

#### Asynchronous Processing

```javascript
// Queue system for heavy operations
const queue = require("bull");

const priceUpdateQueue = new Queue("price updates");
const corporateActionQueue = new Queue("corporate actions");

// Process price updates every hour
priceUpdateQueue.add(
  "update-prices",
  {},
  {
    repeat: { cron: "0 * * * *" }, // Every hour
  }
);
```

### 4. Monitoring and Alerting

#### Key Metrics

- **API Response Times**: P95, P99 latency
- **Database Performance**: Query execution time, connection pool usage
- **Error Rates**: 4xx, 5xx error percentages
- **Business Metrics**: Rewards per minute, portfolio values

#### Alerting Rules

```javascript
// Alert if API response time > 2 seconds
if (responseTime > 2000) {
  alert("High API latency detected");
}

// Alert if error rate > 5%
if (errorRate > 0.05) {
  alert("High error rate detected");
}

// Alert if price data is stale
if (lastPriceUpdate < Date.now() - 10 * 60 * 1000) {
  alert("Price data is stale");
}
```

### 5. Disaster Recovery

#### Backup Strategy

- **Database Backups**: Daily full backups, hourly incremental
- **Point-in-Time Recovery**: Transaction log backups
- **Cross-Region Replication**: Multi-region deployment

#### Failover Procedures

```javascript
// Automatic failover for price service
const priceServices = [
  "primary-price-service.com",
  "secondary-price-service.com",
  "fallback-price-service.com",
];

async function getPriceWithFailover(stockSymbol) {
  for (const service of priceServices) {
    try {
      return await callPriceService(service, stockSymbol);
    } catch (error) {
      console.warn(`Price service ${service} failed:`, error);
      continue;
    }
  }
  throw new Error("All price services failed");
}
```

### 6. Security Considerations

#### Data Protection

- **Encryption**: Encrypt sensitive data at rest and in transit
- **Access Control**: Role-based access control (RBAC)
- **Audit Logging**: Log all sensitive operations

#### Rate Limiting

```javascript
// Rate limiting per user
const rateLimit = require("express-rate-limit");

const userRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each user to 100 requests per windowMs
  keyGenerator: (req) => req.params.userId,
});
```

### 7. Testing Strategy

#### Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Test edge cases and error conditions

#### Integration Tests

- Test API endpoints end-to-end
- Test database transactions
- Test external service integrations

#### Load Tests

- Simulate high user load
- Test database performance under load
- Test cache effectiveness

#### Chaos Engineering

- Randomly fail external services
- Simulate network partitions
- Test failover mechanisms

---

## Implementation Recommendations

### Phase 1: Core Functionality

1. Implement basic reward system
2. Add idempotency handling
3. Implement basic error handling

### Phase 2: Edge Cases

1. Add corporate action processing
2. Implement adjustment/refund system
3. Add comprehensive logging

### Phase 3: Scaling

1. Implement caching layer
2. Add monitoring and alerting
3. Optimize database queries

### Phase 4: Advanced Features

1. Microservices architecture
2. Advanced analytics
3. Machine learning for price prediction

