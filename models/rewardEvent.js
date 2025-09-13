const mongoose = require("mongoose");
const { Schema } = mongoose;

const rewardEventSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    stockSymbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    quantity: {
      type: Schema.Types.Decimal128,
      required: true,
      min: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "ADJUSTED", "CANCELLED", "REFUNDED"],
      default: "ACTIVE",
      index: true,
    },
    adjustmentReason: {
      type: String,
      enum: [
        "STOCK_SPLIT",
        "MERGER",
        "DELISTING",
        "MANUAL_ADJUSTMENT",
        "REFUND",
      ],
      required: function () {
        return this.status !== "ACTIVE";
      },
    },
    parentRewardId: {
      type: Schema.Types.ObjectId,
      ref: "RewardEvent",
      required: function () {
        return this.status === "ADJUSTED" || this.status === "REFUNDED";
      },
    },
    originalQuantity: {
      type: Schema.Types.Decimal128,
      required: function () {
        return this.status === "ADJUSTED";
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

module.exports = mongoose.model("RewardEvent", rewardEventSchema);
