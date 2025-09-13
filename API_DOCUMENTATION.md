# Stocky Stock Reward System - API Documentation

## Overview

The Stocky system allows users to earn shares of Indian stocks as incentives. This document provides comprehensive API specifications for all endpoints.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the system does not implement authentication. In production, you would add JWT tokens or API keys.

---

## API Endpoints

### 1. Record Stock Reward

**POST** `/rewards`

Records that a user has been rewarded with shares of a stock.

#### Request Body

```json
{
  "userId": "string (required)",
  "stockSymbol": "string (required)",
  "shares": "number (required, positive)",
  "timestamp": "ISO 8601 date string (optional, defaults to current time)",
  "idempotencyKey": "string (optional, for duplicate prevention)",
  "notes": "string (optional, max 500 characters)"
}
```

#### Example Request

```json
{
  "userId": "user123",
  "stockSymbol": "RELIANCE",
  "shares": 2.5,
  "timestamp": "2024-01-15T10:30:00Z",
  "idempotencyKey": "reward_user123_reliance_20240115_001",
  "notes": "Onboarding bonus"
}
```

#### Response (201 Created)

```json
{
  "message": "Reward recorded successfully",
  "rewardEvent": {
    "_id": "65a1b2c3d4e5f6789012345",
    "userId": "user123",
    "stockSymbol": "RELIANCE",
    "quantity": "2.500000",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "idempotencyKey": "reward_user123_reliance_20240115_001",
    "status": "ACTIVE"
  },
  "transactionDetails": {
    "inrValue": "6250.0000",
    "fees": {
      "brokerage": "6.2500",
      "stt": "1.5625",
      "gst": "1.1250",
      "total": "8.9375"
    }
  }
}
```

#### Error Responses

- **400 Bad Request**: Missing required fields or invalid data
- **409 Conflict**: Duplicate idempotency key
- **500 Internal Server Error**: Server error

---

### 2. Get Today's Stock Rewards

**GET** `/rewards/today-stocks/{userId}`

Returns all stock rewards for a user for today.

#### Path Parameters

- `userId` (string, required): User identifier

#### Response (200 OK)

```json
{
  "userId": "user123",
  "date": "2024-01-15",
  "rewards": [
    {
      "_id": "65a1b2c3d4e5f6789012345",
      "userId": "user123",
      "stockSymbol": "RELIANCE",
      "quantity": "2.500000",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "status": "ACTIVE",
      "notes": "Onboarding bonus"
    },
    {
      "_id": "65a1b2c3d4e5f6789012346",
      "userId": "user123",
      "stockSymbol": "TCS",
      "quantity": "1.000000",
      "timestamp": "2024-01-15T14:20:00.000Z",
      "status": "ACTIVE",
      "notes": "Referral bonus"
    }
  ]
}
```

---

### 3. Get Historical INR Values

**GET** `/rewards/historical-inr/{userId}`

Returns the INR value of user's stock rewards for all past days.

#### Path Parameters

- `userId` (string, required): User identifier

#### Response (200 OK)

```json
{
  "userId": "user123",
  "historicalInrValue": [
    {
      "date": "2024-01-10",
      "totalInrValue": "12500.0000"
    },
    {
      "date": "2024-01-11",
      "totalInrValue": "12850.0000"
    },
    {
      "date": "2024-01-12",
      "totalInrValue": "12400.0000"
    }
  ]
}
```

---

### 4. Get User Statistics

**GET** `/rewards/stats/{userId}`

Returns comprehensive statistics for a user including today's rewards and current portfolio value.

#### Path Parameters

- `userId` (string, required): User identifier

#### Response (200 OK)

```json
{
  "userId": "user123",
  "todayRewardsByStock": [
    {
      "stockSymbol": "RELIANCE",
      "totalShares": "2.500000"
    },
    {
      "stockSymbol": "TCS",
      "totalShares": "1.000000"
    }
  ],
  "currentPortfolioValue": "15750.0000",
  "portfolioDetails": [
    {
      "stockSymbol": "RELIANCE",
      "shares": "2.500000",
      "currentPrice": "2500.0000",
      "currentValue": "6250.0000"
    },
    {
      "stockSymbol": "TCS",
      "shares": "1.000000",
      "currentPrice": "3500.0000",
      "currentValue": "3500.0000"
    }
  ]
}
```

---

### 5. Get User Portfolio (Bonus)

**GET** `/rewards/portfolio/{userId}`

Returns detailed portfolio holdings with current values.

#### Path Parameters

- `userId` (string, required): User identifier

#### Response (200 OK)

```json
{
  "userId": "user123",
  "portfolio": [
    {
      "stockSymbol": "RELIANCE",
      "shares": "2.500000",
      "currentPrice": "2500.0000",
      "currentValue": "6250.0000"
    },
    {
      "stockSymbol": "TCS",
      "shares": "1.000000",
      "currentPrice": "3500.0000",
      "currentValue": "3500.0000"
    }
  ],
  "totalPortfolioValue": "9750.0000"
}
```

---

## Data Types

### Stock Quantities

- **Type**: `Decimal128` (MongoDB) / `NUMERIC(18, 6)` (SQL equivalent)
- **Precision**: 6 decimal places
- **Range**: 0 to 999,999,999,999.999999
- **Example**: `2.500000` shares

### INR Amounts

- **Type**: `Decimal128` (MongoDB) / `NUMERIC(18, 4)` (SQL equivalent)
- **Precision**: 4 decimal places
- **Range**: 0 to 999,999,999,999.9999
- **Example**: `6250.0000` INR

### Timestamps

- **Format**: ISO 8601
- **Example**: `2024-01-15T10:30:00.000Z`

---

## Error Handling

### Standard Error Response Format

```json
{
  "message": "Error description",
  "error": "Detailed error message (in development)"
}
```

### Common HTTP Status Codes

- **200 OK**: Successful request
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **404 Not Found**: Resource not found
- **409 Conflict**: Duplicate resource (e.g., idempotency key)
- **500 Internal Server Error**: Server error

---

## Rate Limiting

Currently not implemented. In production, consider implementing rate limiting to prevent abuse.

## Caching

- Price data is cached for 5 minutes to reduce API calls
- Historical data is not cached and fetched from database

## Idempotency

- Use `idempotencyKey` in POST requests to prevent duplicate processing
- Keys should be unique per user and include timestamp/sequence
- Example: `reward_user123_reliance_20240115_001`

