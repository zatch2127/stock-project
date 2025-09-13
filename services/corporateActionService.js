const RewardEvent = require("../models/rewardEvent");
const LedgerEntry = require("../models/ledgerEntry");
const StockCorporateAction = require("../models/stockCorporateAction");

class CorporateActionService {
  async processStockSplit(stockSymbol, from, to, effectiveDate) {
    const splitRatio = to / from;

    const rewardEvents = await RewardEvent.find({
      stockSymbol,
      status: "ACTIVE",
      timestamp: { $lt: effectiveDate },
    });

    for (const event of rewardEvents) {
      const originalQuantity = parseFloat(event.quantity.toString());
      const newQuantity = originalQuantity * splitRatio;

      const adjustmentEvent = await RewardEvent.create({
        userId: event.userId,
        stockSymbol,
        quantity: newQuantity - originalQuantity,
        timestamp: effectiveDate,
        idempotencyKey: `SPLIT_${event._id}_${Date.now()}`,
        status: "ADJUSTED",
        adjustmentReason: "STOCK_SPLIT",
        parentRewardId: event._id,
        originalQuantity: event.quantity,
        notes: `Stock split adjustment: ${from}:${to}`,
      });

      event.status = "ADJUSTED";
      event.adjustmentReason = "STOCK_SPLIT";
      await event.save();

      await LedgerEntry.create({
        transactionId: adjustmentEvent._id,
        userId: event.userId,
        account: "USER_PORTFOLIO",
        entryType: "CREDIT",
        stockSymbol,
        quantity: newQuantity - originalQuantity,
        description: `Stock split adjustment: ${from}:${to} for ${stockSymbol}`,
        status: "COMPLETED",
      });
    }

    await StockCorporateAction.updateOne(
      { stockSymbol, actionType: "STOCK_SPLIT", effectiveDate },
      { status: "PROCESSED", processedAt: new Date() }
    );
  }

  async processMerger(
    oldStockSymbol,
    newStockSymbol,
    exchangeRatio,
    effectiveDate
  ) {
    const rewardEvents = await RewardEvent.find({
      stockSymbol: oldStockSymbol,
      status: "ACTIVE",
      timestamp: { $lt: effectiveDate },
    });

    for (const event of rewardEvents) {
      const oldQuantity = parseFloat(event.quantity.toString());
      const newQuantity = oldQuantity * exchangeRatio;

      const mergerEvent = await RewardEvent.create({
        userId: event.userId,
        stockSymbol: newStockSymbol,
        quantity: newQuantity,
        timestamp: effectiveDate,
        idempotencyKey: `MERGER_${event._id}_${Date.now()}`,
        status: "ADJUSTED",
        adjustmentReason: "MERGER",
        parentRewardId: event._id,
        originalQuantity: event.quantity,
        notes: `Merger adjustment: ${oldStockSymbol} -> ${newStockSymbol} (${exchangeRatio}:1)`,
      });

      event.status = "ADJUSTED";
      event.adjustmentReason = "MERGER";
      await event.save();

      await LedgerEntry.create({
        transactionId: mergerEvent._id,
        userId: event.userId,
        account: "USER_PORTFOLIO",
        entryType: "DEBIT",
        stockSymbol: oldStockSymbol,
        quantity: oldQuantity,
        description: `Merger: ${oldStockSymbol} -> ${newStockSymbol}`,
        status: "COMPLETED",
      });

      await LedgerEntry.create({
        transactionId: mergerEvent._id,
        userId: event.userId,
        account: "USER_PORTFOLIO",
        entryType: "CREDIT",
        stockSymbol: newStockSymbol,
        quantity: newQuantity,
        description: `Merger: ${oldStockSymbol} -> ${newStockSymbol}`,
        status: "COMPLETED",
      });
    }

    await StockCorporateAction.updateOne(
      { stockSymbol: oldStockSymbol, actionType: "MERGER", effectiveDate },
      { status: "PROCESSED", processedAt: new Date() }
    );
  }

  async processDelisting(stockSymbol, finalPrice, effectiveDate) {
    const rewardEvents = await RewardEvent.find({
      stockSymbol,
      status: "ACTIVE",
      timestamp: { $lt: effectiveDate },
    });

    for (const event of rewardEvents) {
      const quantity = parseFloat(event.quantity.toString());
      const totalValue = quantity * finalPrice;

      event.status = "ADJUSTED";
      event.adjustmentReason = "DELISTING";
      await event.save();

      await LedgerEntry.create({
        transactionId: event._id,
        userId: event.userId,
        account: "USER_PORTFOLIO",
        entryType: "DEBIT",
        stockSymbol,
        quantity,
        description: `Delisting: ${stockSymbol} at ₹${finalPrice}`,
        status: "COMPLETED",
      });

      await LedgerEntry.create({
        transactionId: event._id,
        userId: event.userId,
        account: "COMPANY_CASH",
        entryType: "CREDIT",
        inrAmount: totalValue,
        description: `Delisting compensation: ${quantity} shares of ${stockSymbol}`,
        status: "COMPLETED",
      });
    }

    await StockCorporateAction.updateOne(
      { stockSymbol, actionType: "DELISTING", effectiveDate },
      { status: "PROCESSED", processedAt: new Date() }
    );
  }

  async getPendingCorporateActions() {
    return await StockCorporateAction.find({
      status: "ANNOUNCED",
      effectiveDate: { $lte: new Date() },
    }).sort({ effectiveDate: 1 });
  }

  async processPendingCorporateActions() {
    const pendingActions = await this.getPendingCorporateActions();

    for (const action of pendingActions) {
      try {
        switch (action.actionType) {
          case "STOCK_SPLIT":
            await this.processStockSplit(
              action.stockSymbol,
              action.details.from,
              action.details.to,
              action.effectiveDate
            );
            break;
          case "MERGER":
            await this.processMerger(
              action.stockSymbol,
              action.details.newStockSymbol,
              parseFloat(action.details.exchangeRatio.toString()),
              action.effectiveDate
            );
            break;
          case "DELISTING":
            await this.processDelisting(
              action.stockSymbol,
              parseFloat(action.details.finalPrice.toString()),
              action.effectiveDate
            );
            break;
        }
      } catch (error) {
        console.error(
          `Error processing corporate action ${action._id}:`,
          error
        );
        action.status = "CANCELLED";
        await action.save();
      }
    }
  }
}

module.exports = new CorporateActionService();
