# Stocky Database Schema Documentation

## Overview

The Stocky system uses MongoDB with Mongoose ODM. The schema is designed to support a double-entry bookkeeping system for tracking stock rewards and company expenses.

---

## Collections (Tables)

### 1. RewardEvent Collection

**Purpose**: Records all stock reward events given to users.

```javascript
{
  _id: ObjectId,
  userId: String (indexed, required),
  stockSymbol: String (indexed, required, uppercase),
  quantity: Decimal128 (required, min: 0),
  timestamp: Date (indexed, default: Date.now),
  notes: String (max: 500),
  idempotencyKey: String (unique, indexed, required),
  status: String (enum: ['ACTIVE', 'ADJUSTED', 'CANCELLED', 'REFUNDED'], default: 'ACTIVE'),
  adjustmentReason: String (enum: ['STOCK_SPLIT', 'MERGER', 'DELISTING', 'MANUAL_ADJUSTMENT', 'REFUND']),
  parentRewardId: ObjectId (ref: 'RewardEvent'),
  originalQuantity: Decimal128,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:

- `{ userId: 1 }`
- `{ stockSymbol: 1 }`
- `{ timestamp: 1 }`
- `{ idempotencyKey: 1 }` (unique)
- `{ status: 1 }`

---

### 2. LedgerEntry Collection

**Purpose**: Double-entry bookkeeping system for tracking all financial transactions.

```javascript
{
  _id: ObjectId,
  transactionId: ObjectId (indexed, required),
  userId: String (indexed, required),
  account: String (enum: [
    'USER_PORTFOLIO',
    'COMPANY_CASH',
    'BROKERAGE_EXPENSE',
    'STT_EXPENSE',
    'GST_EXPENSE',
    'STAMP_DUTY_EXPENSE',
    'SEBI_FEES_EXPENSE',
    'EXCHANGE_FEES_EXPENSE'
  ], indexed, required),
  entryType: String (enum: ['DEBIT', 'CREDIT'], required),
  stockSymbol: String (uppercase, required for USER_PORTFOLIO),
  quantity: Decimal128 (required for USER_PORTFOLIO, min: 0),
  inrAmount: Decimal128 (required for non-USER_PORTFOLIO, min: 0),
  description: String (max: 500),
  status: String (enum: ['PENDING', 'COMPLETED', 'CANCELLED', 'ADJUSTED'], default: 'COMPLETED'),
  parentEntryId: ObjectId (ref: 'LedgerEntry'),
  adjustmentReason: String (enum: ['STOCK_SPLIT', 'MERGER', 'DELISTING', 'MANUAL_ADJUSTMENT', 'REFUND']),
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:

- `{ transactionId: 1 }`
- `{ userId: 1 }`
- `{ account: 1 }`
- `{ status: 1 }`

---

### 3. StockPriceHistory Collection

**Purpose**: Stores historical stock prices for valuation calculations.

```javascript
{
  _id: ObjectId,
  stockSymbol: String (indexed, required, uppercase),
  price: Decimal128 (required),
  fetchedAt: Date (indexed, default: Date.now)
}
```

**Indexes**:

- `{ stockSymbol: 1 }`
- `{ fetchedAt: 1 }`
- `{ stockSymbol: 1, fetchedAt: 1 }` (compound)

---

### 4. StockCorporateAction Collection

**Purpose**: Tracks corporate actions like stock splits, mergers, and delistings.

```javascript
{
  _id: ObjectId,
  stockSymbol: String (indexed, required, uppercase),
  actionType: String (enum: ['STOCK_SPLIT', 'STOCK_DIVIDEND', 'MERGER', 'DELISTING', 'BONUS_ISSUE'], indexed, required),
  effectiveDate: Date (indexed, required),
  announcementDate: Date (required),
  details: {
    // For stock split
    from: Number (required for STOCK_SPLIT, BONUS_ISSUE),
    to: Number (required for STOCK_SPLIT, BONUS_ISSUE),

    // For dividend
    dividendAmount: Decimal128 (required for STOCK_DIVIDEND),

    // For merger
    newStockSymbol: String (required for MERGER),
    exchangeRatio: Decimal128 (required for MERGER),

    // For delisting
    finalPrice: Decimal128 (required for DELISTING)
  },
  status: String (enum: ['ANNOUNCED', 'PENDING', 'PROCESSED', 'CANCELLED'], default: 'ANNOUNCED', indexed),
  description: String (max: 1000),
  processedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:

- `{ stockSymbol: 1 }`
- `{ actionType: 1 }`
- `{ effectiveDate: 1 }`
- `{ status: 1 }`
- `{ stockSymbol: 1, effectiveDate: 1 }` (compound)
- `{ actionType: 1, status: 1 }` (compound)

---

## Data Types

### Decimal128

- **Purpose**: High-precision decimal arithmetic
- **Precision**: 34 decimal digits
- **Use Cases**: Stock quantities, INR amounts, prices
- **MongoDB**: `Schema.Types.Decimal128`
- **SQL Equivalent**: `NUMERIC(18, 6)` for quantities, `NUMERIC(18, 4)` for amounts

### ObjectId

- **Purpose**: Unique document identifiers
- **Format**: 24-character hexadecimal string
- **Use Cases**: Primary keys, foreign key references

### Date

- **Purpose**: Timestamps and date-based queries
- **Format**: ISO 8601
- **Use Cases**: Event timestamps, effective dates, cache timestamps

---

## Relationships

### One-to-Many Relationships

1. **RewardEvent → LedgerEntry**: One reward event can have multiple ledger entries
2. **RewardEvent → RewardEvent**: Parent-child relationship for adjustments
3. **LedgerEntry → LedgerEntry**: Parent-child relationship for adjustments

### Referential Integrity

- `parentRewardId` references `RewardEvent._id`
- `parentEntryId` references `LedgerEntry._id`
- `transactionId` links ledger entries to their originating transaction

---

## Double-Entry Bookkeeping Rules

### Account Types

- **Asset Accounts**: `USER_PORTFOLIO`, `COMPANY_CASH`
- **Expense Accounts**: `BROKERAGE_EXPENSE`, `STT_EXPENSE`, `GST_EXPENSE`, etc.

### Entry Rules

- **Debit**: Increases assets, increases expenses
- **Credit**: Decreases assets, decreases expenses

### Example Transaction (Stock Reward)

```
1. DEBIT USER_PORTFOLIO (stockSymbol: "RELIANCE", quantity: 2.5)
2. DEBIT COMPANY_CASH (inrAmount: 6250.00)
3. DEBIT BROKERAGE_EXPENSE (inrAmount: 6.25)
4. DEBIT STT_EXPENSE (inrAmount: 1.56)
5. DEBIT GST_EXPENSE (inrAmount: 1.13)
```

---

## Indexing Strategy

### Primary Indexes

- All `_id` fields (automatic)
- Foreign key fields (`userId`, `transactionId`)
- Query fields (`stockSymbol`, `timestamp`)

### Compound Indexes

- `{ userId: 1, timestamp: 1 }` for user timeline queries
- `{ stockSymbol: 1, fetchedAt: 1 }` for price history queries
- `{ stockSymbol: 1, effectiveDate: 1 }` for corporate actions

### Performance Considerations

- Indexes on frequently queried fields
- Compound indexes for multi-field queries
- Sparse indexes for optional fields

---

## Data Validation

### Schema-Level Validation

- Required field validation
- Enum value validation
- Min/max value constraints
- String length limits

### Application-Level Validation

- Idempotency key uniqueness
- Transaction balance validation
- Business rule enforcement

---

## Scaling Considerations

### Horizontal Scaling

- Shard by `userId` for user-specific data
- Shard by `stockSymbol` for price data
- Replica sets for read scaling

### Vertical Scaling

- Index optimization
- Query optimization
- Connection pooling

### Data Archiving

- Archive old price history data
- Archive completed corporate actions
- Archive old ledger entries (with audit trail)

---

## Security Considerations

### Data Protection

- Input sanitization
- SQL injection prevention (N/A for MongoDB)
- XSS prevention in stored descriptions

### Access Control

- User-based data isolation
- Admin-only corporate action processing
- Audit logging for sensitive operations

### Data Integrity

- Transaction atomicity
- Referential integrity checks
- Backup and recovery procedures

