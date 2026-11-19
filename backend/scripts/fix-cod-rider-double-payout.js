/**
 * One-time fix: COD riders were paid twice.
 *
 * Before the fix in createPendingRiderPayout, a COD order queued a wallet
 * payout for the rider's full earning even though the rider had already kept
 * that earning out of the cash they collected. This script finds rider
 * payouts that are still PENDING / PROCESSING and lowers them to what the
 * cash did not cover (or cancels them when the cash covered everything).
 *
 * Payouts that were already COMPLETED are only REPORTED: that money is in the
 * rider's wallet and recovering it is a business decision.
 *
 * Usage (from backend/):
 *   node scripts/fix-cod-rider-double-payout.js           # dry run, changes nothing
 *   node scripts/fix-cod-rider-double-payout.js --apply   # write the corrections
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Payout from "../app/models/payout.js";
import Order from "../app/models/order.js";
import { getOrCreateWallet } from "../app/services/finance/walletService.js";
import { createLedgerEntry } from "../app/services/finance/ledgerService.js";
import {
  PAYOUT_STATUS,
  PAYOUT_TYPE,
  OWNER_TYPE,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_DIRECTION,
} from "../app/constants/finance.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** What the payout should have been for one order. */
function correctAmountForOrder(order) {
  const earning = round(order.paymentBreakdown?.riderPayoutTotal || 0);
  if (order.paymentMode !== "COD") return earning;
  const cash = round(order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0);
  return round(Math.max(earning - Math.min(earning, cash), 0));
}

async function correctPayout(payout, correctAmount, orders) {
  const excess = round(payout.amount - correctAmount);
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const fresh = await Payout.findById(payout._id).session(session);
    if (!fresh || ![PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING].includes(fresh.status)) {
      await session.abortTransaction();
      return "skipped (status changed)";
    }

    const wallet = await getOrCreateWallet(OWNER_TYPE.DELIVERY_PARTNER, fresh.beneficiaryId, { session });
    wallet.pendingBalance = round(Math.max((wallet.pendingBalance || 0) - excess, 0));
    wallet.totalCredited = round(Math.max((wallet.totalCredited || 0) - excess, 0));
    await wallet.save({ session });

    const cancel = correctAmount <= 0;
    const note = `COD double-pay fix: rider kept ₹${excess} from the cash collected`;
    fresh.metadata = {
      ...(fresh.metadata || {}),
      codDoublePayFix: { originalAmount: fresh.amount, removed: excess, fixedAt: new Date() },
    };
    if (cancel) {
      fresh.status = PAYOUT_STATUS.CANCELLED;
      fresh.cancelledAt = new Date();
    } else {
      fresh.amount = correctAmount;
    }
    fresh.remarks = note;
    fresh.markModified("metadata");
    await fresh.save({ session });

    await createLedgerEntry(
      {
        orderId: orders[0]?._id,
        payoutId: fresh._id,
        walletId: wallet._id,
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: fresh.beneficiaryId,
        type: cancel ? LEDGER_TRANSACTION_TYPE.PAYOUT_CANCELLED : LEDGER_TRANSACTION_TYPE.ADJUSTMENT,
        direction: LEDGER_DIRECTION.DEBIT,
        amount: excess,
        description: note,
      },
      { session },
    );

    if (cancel) {
      await Order.updateMany(
        { _id: { $in: orders.map((o) => o._id) } },
        { $set: { "settlementStatus.riderPayout": "COMPLETED" } },
        { session },
      );
    }

    await session.commitTransaction();
    return cancel ? "cancelled" : `lowered to ₹${correctAmount}`;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function run() {
  // the app reads MONGODB_URI first (index.js); connectDB only knows MONGO_URI
  if (!process.env.MONGO_URI && process.env.MONGODB_URI) {
    process.env.MONGO_URI = process.env.MONGODB_URI;
  }
  await connectDB();
  console.log(APPLY ? "MODE: APPLY (writing changes)\n" : "MODE: DRY RUN (nothing is changed; add --apply to fix)\n");

  const payouts = await Payout.find({
    payoutType: PAYOUT_TYPE.DELIVERY_PARTNER,
    status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING, PAYOUT_STATUS.COMPLETED] },
    // created after the code fix: already correct
    "metadata.keptFromCash": { $exists: false },
    "metadata.codDoublePayFix": { $exists: false },
  }).lean();

  const pendingFixes = [];
  const alreadyPaid = [];

  for (const payout of payouts) {
    const orders = await Order.find({ _id: { $in: payout.relatedOrderIds || [] } })
      .select("_id orderId paymentMode paymentBreakdown pricing")
      .lean();
    if (!orders.some((o) => o.paymentMode === "COD")) continue;

    const correctAmount = round(orders.reduce((sum, o) => sum + correctAmountForOrder(o), 0));
    const excess = round(payout.amount - correctAmount);
    if (excess <= 0.01) continue;

    const row = {
      payout,
      orders,
      correctAmount,
      excess,
      label: `payout ${payout._id} | rider ${payout.beneficiaryId} | order(s) ${orders.map((o) => o.orderId).join(", ")} | ₹${payout.amount} → ₹${correctAmount} (overpaid ₹${excess})`,
    };
    (payout.status === PAYOUT_STATUS.COMPLETED ? alreadyPaid : pendingFixes).push(row);
  }

  console.log(`Pending / processing rider payouts to correct: ${pendingFixes.length}`);
  let fixedTotal = 0;
  for (const row of pendingFixes) {
    if (!APPLY) {
      console.log(`  [would fix] ${row.label}`);
      continue;
    }
    try {
      const result = await correctPayout(row.payout, row.correctAmount, row.orders);
      if (!result.startsWith("skipped")) fixedTotal = round(fixedTotal + row.excess);
      console.log(`  [${result}] ${row.label}`);
    } catch (error) {
      console.error(`  [FAILED] ${row.label}: ${error.message}`);
    }
  }
  const pendingTotal = round(pendingFixes.reduce((s, r) => s + r.excess, 0));
  console.log(APPLY ? `  Saved ₹${fixedTotal}\n` : `  Would save ₹${pendingTotal}\n`);

  console.log(`Already PAID rider payouts that were overpaid (not changed): ${alreadyPaid.length}`);
  const byRider = new Map();
  for (const row of alreadyPaid) {
    console.log(`  ${row.label}`);
    const key = String(row.payout.beneficiaryId);
    byRider.set(key, round((byRider.get(key) || 0) + row.excess));
  }
  if (byRider.size) {
    console.log("  Overpaid total per rider:");
    for (const [rider, amount] of byRider) console.log(`    rider ${rider}: ₹${amount}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (error) => {
  console.error("[fix-cod-rider-double-payout] Failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
