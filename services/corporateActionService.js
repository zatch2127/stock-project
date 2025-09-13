const RewardEvent = require("../models/rewardEvent");
const LedgerEntry = require("../models/ledgerEntry");
const StockCorporateAction = require("../models/stockCorporateAction");

class CorporateActionService {
  /**
   * Process stock split for all user holdings
   * @param {string} stockSymbol - Stock symbol
   * @param {number} from - Original ratio
   * @param {number} to - New ratio
   * @param {Date} effectiveDate - When the split takes effect
   */
  async processStockSplit(stockSymbol, from, to, effectiveDate) {
    const splitRatio = to / from;

    // Find all active reward events for this stock before the effective date
    const rewardEvents = await RewardEvent.find({
      stockSymbol,
      status: "ACTIVE",
      timestamp: { $lt: effectiveDate },
    });

    for (const event of rewardEvents) {
      const originalQuantity = parseFloat(event.quantity.toString());
      const newQuantity = originalQuantity * splitRatio;

      // Create adjustment reward event
      const adjustmentEvent = await RewardEvent.create({
        userId: event.userId,
        stockSymbol,
        quantity: newQuantity - originalQuantity, // Only the additional shares
        timestamp: effectiveDate,
        idempotencyKey: `SPLIT_${event._id}_${Date.now()}`,
        status: "ADJUSTED",
        adjustmentReason: "STOCK_SPLIT",
        parentRewardId: event._id,
        originalQuantity: event.quantity,
        notes: `Stock split adjustment: ${from}:${to}`,
      });

      // Update original event status
      event.status = "ADJUSTED";
      event.adjustmentReason = "STOCK_SPLIT";
      await event.save();

      // Create corresponding ledger entries for the additional shares
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

    // Mark corporate action as processed
    await StockCorporateAction.updateOne(
      { stockSymbol, actionType: "STOCK_SPLIT", effectiveDate },
      { status: "PROCESSED", processedAt: new Date() }
    );
  }

  /**
   * Process stock merger
   * @param {string} oldStockSymbol - Original stock symbol
   * @param {string} newStockSymbol - New stock symbol after merger
   * @param {number} exchangeRatio - How many new shares per old share
   * @param {Date} effectiveDate - When the merger takes effect
   */
  async processMerger(
    oldStockSymbol,
    newStockSymbol,
    exchangeRatio,
    effectiveDate
  ) {
    // Find all active reward events for the old stock
    const rewardEvents = await RewardEvent.find({
      stockSymbol: oldStockSymbol,
      status: "ACTIVE",
      timestamp: { $lt: effectiveDate },
    });

    for (const event of rewardEvents) {
      const oldQuantity = parseFloat(event.quantity.toString());
      const newQuantity = oldQuantity * exchangeRatio;

      // Create new reward event for the merged stock
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

      // Mark old event as adjusted
      event.status = "ADJUSTED";
      event.adjustmentReason = "MERGER";
      await event.save();

      // Create ledger entries
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

    // Mark corporate action as processed
    await StockCorporateAction.updateOne(
      { stockSymbol: oldStockSymbol, actionType: "MERGER", effectiveDate },
      { status: "PROCESSED", processedAt: new Date() }
    );
  }

  /**
   * Process stock delisting
   * @param {string} stockSymbol - Stock symbol to delist
   * @param {number} finalPrice - Final price for delisting
   * @param {Date} effectiveDate - When delisting takes effect
   */
  async processDelisting(stockSymbol, finalPrice, effectiveDate) {
    // Find all active reward events for this stock
    const rewardEvents = await RewardEvent.find({
      stockSymbol,
      status: "ACTIVE",
      timestamp: { $lt: effectiveDate },
    });

    for (const event of rewardEvents) {
      const quantity = parseFloat(event.quantity.toString());
      const totalValue = quantity * finalPrice;

      // Mark original event as adjusted
      event.status = "ADJUSTED";
      event.adjustmentReason = "DELISTING";
      await event.save();

      // Create cash credit entry
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

    // Mark corporate action as processed
    await StockCorporateAction.updateOne(
      { stockSymbol, actionType: "DELISTING", effectiveDate },
      { status: "PROCESSED", processedAt: new Date() }
    );
  }

  /**
   * Get pending corporate actions that need to be processed
   */
  async getPendingCorporateActions() {
    return await StockCorporateAction.find({
      status: "ANNOUNCED",
      effectiveDate: { $lte: new Date() },
    }).sort({ effectiveDate: 1 });
  }

  /**
   * Process all pending corporate actions
   */
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
        // Mark as failed or retry later
        action.status = "CANCELLED";
        await action.save();
      }
    }
  }
}

module.exports = new CorporateActionService();

