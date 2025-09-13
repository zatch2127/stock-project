const mongoose = require("mongoose");
const { Schema } = mongoose;

const stockCorporateActionSchema = new Schema(
  {
    stockSymbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: [
        "STOCK_SPLIT",
        "STOCK_DIVIDEND",
        "MERGER",
        "DELISTING",
        "BONUS_ISSUE",
      ],
      index: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      index: true,
    },
    announcementDate: {
      type: Date,
      required: true,
    },
    details: {
      // For stock split: { from: 1, to: 2 } means 1:2 split
      from: {
        type: Number,
        required: function () {
          return ["STOCK_SPLIT", "BONUS_ISSUE"].includes(this.actionType);
        },
      },
      to: {
        type: Number,
        required: function () {
          return ["STOCK_SPLIT", "BONUS_ISSUE"].includes(this.actionType);
        },
      },
      // For dividend: amount per share
      dividendAmount: {
        type: Schema.Types.Decimal128,
        required: function () {
          return this.actionType === "STOCK_DIVIDEND";
        },
      },
      // For merger: new stock symbol
      newStockSymbol: {
        type: String,
        uppercase: true,
        trim: true,
        required: function () {
          return this.actionType === "MERGER";
        },
      },
      // For merger: exchange ratio
      exchangeRatio: {
        type: Schema.Types.Decimal128,
        required: function () {
          return this.actionType === "MERGER";
        },
      },
      // For delisting: final price
      finalPrice: {
        type: Schema.Types.Decimal128,
        required: function () {
          return this.actionType === "DELISTING";
        },
      },
    },
    status: {
      type: String,
      enum: ["ANNOUNCED", "PENDING", "PROCESSED", "CANCELLED"],
      default: "ANNOUNCED",
      index: true,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for efficient queries
stockCorporateActionSchema.index({ stockSymbol: 1, effectiveDate: 1 });
stockCorporateActionSchema.index({ actionType: 1, status: 1 });

module.exports = mongoose.model(
  "StockCorporateAction",
  stockCorporateActionSchema
);

