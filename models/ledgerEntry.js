const mongoose = require("mongoose");
const { Schema } = mongoose;

const ledgerEntrySchema = new Schema(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    account: {
      type: String,
      required: true,
      enum: [
        "USER_PORTFOLIO",
        "COMPANY_CASH",
        "BROKERAGE_EXPENSE",
        "STT_EXPENSE",
        "GST_EXPENSE",
        "STAMP_DUTY_EXPENSE",
        "SEBI_FEES_EXPENSE",
        "EXCHANGE_FEES_EXPENSE",
      ],
      index: true,
    },
    entryType: {
      type: String,
      required: true,
      enum: ["DEBIT", "CREDIT"],
    },
    stockSymbol: {
      type: String,
      uppercase: true,
      trim: true,
      required: function () {
        return this.account === "USER_PORTFOLIO";
      },
    },
    quantity: {
      type: Schema.Types.Decimal128,
      required: function () {
        return this.account === "USER_PORTFOLIO";
      },
      min: 0,
    },
    inrAmount: {
      type: Schema.Types.Decimal128,
      required: function () {
        return this.account !== "USER_PORTFOLIO";
      },
      min: 0,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "CANCELLED", "ADJUSTED"],
      default: "COMPLETED",
      index: true,
    },
    parentEntryId: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
      required: function () {
        return this.status === "ADJUSTED";
      },
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

ledgerEntrySchema.statics.validateTransaction = async function (transactionId) {
  const entries = await this.find({ transactionId });
  const balance = entries.reduce((acc, entry) => {
    let amount = 0;
    if (entry.inrAmount) {
      amount = parseFloat(entry.inrAmount.toString());
    }
    return acc + (entry.entryType === "DEBIT" ? amount : -amount);
  }, 0);

 
  return Math.abs(balance) < 0.0001;
};

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
