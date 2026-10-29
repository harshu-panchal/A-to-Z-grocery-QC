import Order from "../models/order.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import Transaction from "../models/transaction.js";
import Delivery from "../models/delivery.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import Wallet from "../models/wallet.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import {
  writeDeliveryLocation,
  appendTrailPoint,
} from "../services/firebaseService.js";
import { withLock } from "../utils/distributedLock.js";
import { buildKey, invalidate } from "../services/cacheService.js";
import { roundCurrency } from "../utils/money.js";
import logger from "../services/logger.js";
import { reconcileCodCash } from "../services/finance/orderFinanceService.js";
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  getCapturedOrderPayment,
  getRazorpayKeyId,
  isValidRazorpaySignature,
} from "../services/payment/razorpayClient.js";
import { shouldThrottle as throttleLocationUpdate } from "../services/delivery/locationThrottleService.js";
import {
  getDeliveryStats as getDeliveryStatsFromService,
  getDeliveryEarnings as getDeliveryEarningsFromService,
  getDeliveryWithdrawableBalance,
  getDeliveryCodCashSummary as getDeliveryCodCashSummaryFromService,
  invalidateRiderCashCaches,
  recordMissedCodCollections,
} from "../services/delivery/deliveryEarningsService.js";

/* ===============================
   GET DELIVERY DASHBOARD STATS
================================ */
export const getDeliveryStats = async (req, res) => {
    try {
        const result = await getDeliveryStatsFromService(req.user.id);
        return handleResponse(res, 200, "Stats fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY EARNINGS
================================ */
export const getDeliveryEarnings = async (req, res) => {
    try {
        const result = await getDeliveryEarningsFromService(req.user.id);
        return handleResponse(res, 200, "Earnings fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY COD CASH SUMMARY
================================ */
export const getDeliveryCodCashSummary = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        const result = await getDeliveryCodCashSummaryFromService(rawId);
        return handleResponse(res, 200, "COD cash summary fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

const NO_COD_READY_MSG =
    "No collected COD cash is ready to submit yet. Mark customer cash as collected first.";

function riderObjectId(req) {
    const rawId = req.user?.id ?? req.user?._id;
    if (!rawId) return { error: [401, "Unauthorized"] };
    if (!mongoose.Types.ObjectId.isValid(String(rawId))) return { error: [401, "Invalid user id"] };
    return { id: new mongoose.Types.ObjectId(String(rawId)) };
}

/** Collected COD cash this rider still owes, oldest order first. */
async function loadCollectedCod(deliveryBoyId) {
    await recordMissedCodCollections(deliveryBoyId);
    const orders = await Order.find({
        deliveryBoy: deliveryBoyId,
        paymentMode: "COD",
        status: { $ne: "cancelled" },
        orderStatus: { $ne: "cancelled" },
        "financeFlags.codMarkedCollected": true,
        "paymentBreakdown.codPendingAmount": { $gt: 0 },
    })
        .select("orderId paymentBreakdown.codPendingAmount")
        .sort({ createdAt: 1 })
        .lean();
    const totalAvailable = roundCurrency(
        orders.reduce((sum, order) => sum + Number(order?.paymentBreakdown?.codPendingAmount || 0), 0),
    );
    return { orders, totalAvailable };
}

/** Amount check shared by cash and Razorpay; `error` is [status, message]. */
function validateCodAmount(requestedRaw, totalAvailable) {
    if (totalAvailable <= 0) return { error: [400, NO_COD_READY_MSG] };
    const requested = requestedRaw == null || requestedRaw === "" ? null : roundCurrency(requestedRaw);
    if (requested != null && (!Number.isFinite(Number(requestedRaw)) || requested <= 0)) {
        return { error: [400, "Enter a valid amount to submit"] };
    }
    const amount = requested == null ? totalAvailable : requested;
    if (amount > totalAvailable) {
        return { error: [400, `You can submit up to ${String.fromCharCode(8377)}${totalAvailable.toLocaleString()}`] };
    }
    return { amount };
}

/** Settle `amount` across the rider's collected COD orders and log one settlement. */
async function settleCollectedCod(deliveryBoyId, orders, amount, { actorId, source, reference, meta = {} }) {
    const settledOrders = [];
    let totalSubmitted = 0;
    let remaining = amount;

    for (const order of orders) {
        const pending = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
        if (pending <= 0 || remaining <= 0) continue;
        const settleAmount = roundCurrency(Math.min(pending, remaining));

        await reconcileCodCash(order._id, settleAmount, deliveryBoyId, {
            actorId,
            metadata: { source, initiatedBy: "delivery_partner", ...meta },
        });

        totalSubmitted = roundCurrency(totalSubmitted + settleAmount);
        remaining = roundCurrency(remaining - settleAmount);
        settledOrders.push({ orderId: order.orderId, amount: settleAmount });
    }

    if (totalSubmitted > 0) {
        await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Cash Settlement",
            amount: -Math.abs(totalSubmitted),
            status: "Settled",
            reference,
            meta: { source, orders: settledOrders.map((item) => item.orderId), ...meta },
        });
    }

    // the COD page / dashboard read these through a short cache
    await invalidateRiderCashCaches(deliveryBoyId);
    const wallet = await Wallet.findOne({ ownerType: "DELIVERY_PARTNER", ownerId: deliveryBoyId })
        .select("cashInHand")
        .lean();

    return {
        totalSubmitted,
        orderCount: settledOrders.length,
        orders: settledOrders,
        cashInHand: roundCurrency(wallet?.cashInHand || 0),
    };
}

/* ===============================
   SUBMIT DELIVERY COD CASH
================================ */
export const submitDeliveryCodCashToAdmin = async (req, res) => {
    try {
        const rider = riderObjectId(req);
        if (rider.error) return handleResponse(res, ...rider.error);
        const deliveryBoyId = rider.id;

        const { orders, totalAvailable } = await loadCollectedCod(deliveryBoyId);
        const check = validateCodAmount(req.body?.amount, totalAvailable);
        if (check.error) return handleResponse(res, ...check.error);

        const result = await settleCollectedCod(deliveryBoyId, orders, check.amount, {
            actorId: req.user?.id || null,
            source: "delivery_cod_cash_page",
            reference: `CSH-SET-${deliveryBoyId}-${Date.now()}`,
        });
        if (result.totalSubmitted <= 0) return handleResponse(res, 400, NO_COD_READY_MSG);

        return handleResponse(res, 200, "COD cash submitted to admin successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   PAY COD CASH ONLINE (Razorpay)
================================ */
// Step 1: create a Razorpay order for the amount; the app opens the popup.
export const createCodRazorpayOrder = async (req, res) => {
    try {
        const rider = riderObjectId(req);
        if (rider.error) return handleResponse(res, ...rider.error);

        const { totalAvailable } = await loadCollectedCod(rider.id);
        const check = validateCodAmount(req.body?.amount, totalAvailable);
        if (check.error) return handleResponse(res, ...check.error);

        const order = await createRazorpayOrder({
            amountPaise: Math.round(check.amount * 100),
            receipt: `COD-${String(rider.id).slice(-8)}-${Date.now()}`,
            notes: { purpose: "cod_cash", deliveryBoyId: String(rider.id) },
        });
        return handleResponse(res, 200, "Payment started", {
            keyId: getRazorpayKeyId(),
            razorpayOrderId: order.id,
            amount: order.amount,
            currency: order.currency,
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

// Step 2: after the popup, check the payment with Razorpay and settle it once.
export const verifyCodRazorpayPayment = async (req, res) => {
    try {
        const rider = riderObjectId(req);
        if (rider.error) return handleResponse(res, ...rider.error);
        const deliveryBoyId = rider.id;

        const orderId = String(req.body?.razorpay_order_id || "");
        const paymentId = String(req.body?.razorpay_payment_id || "");
        const signature = String(req.body?.razorpay_signature || "");
        if (!orderId || !paymentId || !isValidRazorpaySignature({ orderId, paymentId, signature })) {
            return handleResponse(res, 400, "Payment could not be verified");
        }

        const rzpOrder = await fetchRazorpayOrder(orderId);
        if (rzpOrder?.notes?.purpose !== "cod_cash" || rzpOrder?.notes?.deliveryBoyId !== String(deliveryBoyId)) {
            return handleResponse(res, 403, "This payment does not belong to you");
        }
        const paid = await getCapturedOrderPayment(orderId, paymentId);
        if (!paid || paid.status !== "captured") return handleResponse(res, 400, "Payment is not complete yet");

        const reference = `CSH-RZP-${paymentId}`;
        const result = await withLock(`lock:cod-razorpay:${paymentId}`, 60000, async () => {
            // a retried verify must not settle the same payment twice
            if (await Transaction.exists({ reference })) return { alreadySettled: true };
            const { orders } = await loadCollectedCod(deliveryBoyId);
            return settleCollectedCod(deliveryBoyId, orders, roundCurrency(paid.amount / 100), {
                actorId: req.user?.id || null,
                source: "delivery_cod_razorpay",
                reference,
                meta: { method: "razorpay", razorpayOrderId: orderId, razorpayPaymentId: paymentId },
            });
        });

        if (result.alreadySettled) {
            return handleResponse(res, 200, "Payment already recorded", result);
        }
        if (result.totalSubmitted <= 0) {
            // paid but nothing left to settle (e.g. admin settled it meanwhile)
            logger.warn("COD Razorpay payment had nothing to settle", {
                deliveryBoyId: String(deliveryBoyId), paymentId, amount: paid.amount,
            });
            return handleResponse(res, 409, "Payment received, but no COD cash was pending. Please contact admin.");
        }
        return handleResponse(res, 200, "COD cash paid to admin via Razorpay", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY ORDER HISTORY
================================ */
/**
 * Any order this rider was linked to: primary assignment, return pickup, or v2 broadcast winner.
 */
async function buildAssignedToPartnerFilter(deliveryBoyId) {
    const clauses = [
        { deliveryBoy: deliveryBoyId },
        { returnDeliveryBoy: deliveryBoyId },
    ];
    try {
        const winnerOrderIds = await DeliveryAssignment.distinct("orderId", {
            winnerDeliveryId: deliveryBoyId,
        });
        if (winnerOrderIds?.length) {
            clauses.push({ orderId: { $in: winnerOrderIds } });
        }
    } catch {
        /* ignore */
    }
    return { $or: clauses };
}

// ---- Rider task view -------------------------------------------------------
// One order can hold two separate jobs for riders: the delivery and, later, a
// return pickup (often done by a different rider). Each job is reported on its
// own so a rider never sees someone else's delivery as "delivered by me".
const ACTIVE_DELIVERY_WORKFLOW = [
    WORKFLOW_STATUS.DELIVERY_ASSIGNED,
    WORKFLOW_STATUS.PICKUP_READY,
    WORKFLOW_STATUS.OUT_FOR_DELIVERY,
];
const ACTIVE_RETURN_STATUSES = ["return_pickup_assigned", "return_in_transit", "return_drop_pending"];
const DONE_RETURN_STATUSES = ["returned", "qc_passed", "qc_failed", "refund_completed"];

function deliveryStage(order) {
    const wf = String(order.workflowStatus || "").toUpperCase();
    const st = String(order.status || "").toLowerCase();
    if (wf === WORKFLOW_STATUS.CANCELLED || st === "cancelled") return { state: "cancelled", label: "Cancelled" };
    if (wf === WORKFLOW_STATUS.DELIVERED || st === "delivered") return { state: "done", label: "Delivered" };
    if (wf === WORKFLOW_STATUS.OUT_FOR_DELIVERY || st === "out_for_delivery") return { state: "active", label: "Out for delivery" };
    if (wf === WORKFLOW_STATUS.PICKUP_READY) return { state: "active", label: "At store, pick up order" };
    return { state: "active", label: "Go to store" };
}

function returnStage(order) {
    const rs = String(order.returnStatus || "");
    if (rs === "return_pickup_assigned") return { state: "active", label: "Pick up from customer" };
    if (rs === "return_in_transit") return { state: "active", label: "On the way to store" };
    if (rs === "return_drop_pending") return { state: "active", label: "At store, seller OTP" };
    if (DONE_RETURN_STATUSES.includes(rs)) return { state: "done", label: "Returned to store" };
    return { state: "cancelled", label: "Return closed" };
}

/** The jobs this rider did / is doing on an order. */
function riderTasksFor(order, riderId, winnerOrderIds) {
    const me = String(riderId);
    const tasks = [];
    const isDeliveryRider =
        String(order.deliveryBoy?._id || order.deliveryBoy || "") === me ||
        winnerOrderIds.has(String(order.orderId));
    if (isDeliveryRider) {
        const stage = deliveryStage(order);
        tasks.push({ kind: "delivery", ...stage, at: order.deliveredAt || order.updatedAt || order.createdAt });
    }
    if (String(order.returnDeliveryBoy?._id || order.returnDeliveryBoy || "") === me && order.returnStatus && order.returnStatus !== "none") {
        const stage = returnStage(order);
        tasks.push({ kind: "return", ...stage, at: order.returnDeliveredBackAt || order.returnPickedAt || order.updatedAt });
    }
    return tasks;
}

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

/**
 * GET /delivery/order-history?status=all|active|today|delivered|cancelled|returns
 * Every order carries `riderTasks`: [{ kind: "delivery"|"return", state: "active"|"done"|"cancelled", label, at }].
 * - active:    jobs still in progress (deliveries + return pickups)
 * - today:     jobs finished today
 * - delivered: orders this rider delivered (not return pickups of others' deliveries)
 * - returns:   return pickups this rider handled
 */
export const getMyDeliveryOrders = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }
        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const normalized = String(req.query.status || "all").toLowerCase();

        let winnerOrderIds = [];
        try {
            winnerOrderIds = await DeliveryAssignment.distinct("orderId", { winnerDeliveryId: deliveryBoyId });
        } catch {
            /* ignore */
        }
        const winnerSet = new Set(winnerOrderIds.map(String));
        const asDeliveryRider = {
            $or: [
                { deliveryBoy: deliveryBoyId },
                ...(winnerOrderIds.length ? [{ orderId: { $in: winnerOrderIds } }] : []),
            ],
        };
        const asReturnRider = { returnDeliveryBoy: deliveryBoyId, returnStatus: { $nin: [null, "none"] } };
        const isDelivered = { $or: [{ status: "delivered" }, { workflowStatus: WORKFLOW_STATUS.DELIVERED }] };
        const isCancelled = { $or: [{ status: "cancelled" }, { workflowStatus: WORKFLOW_STATUS.CANCELLED }] };
        const isActiveDelivery = {
            $or: [
                { workflowStatus: { $in: ACTIVE_DELIVERY_WORKFLOW } },
                { workflowStatus: { $exists: false }, status: { $in: ["confirmed", "packed", "out_for_delivery"] } },
            ],
        };
        const today = startOfToday();

        let query;
        if (normalized === "delivered") {
            query = { $and: [asDeliveryRider, isDelivered] };
        } else if (normalized === "cancelled") {
            query = { $and: [asDeliveryRider, isCancelled] };
        } else if (normalized === "returns") {
            query = asReturnRider;
        } else if (normalized === "active") {
            query = {
                $or: [
                    { $and: [asDeliveryRider, isActiveDelivery] },
                    { ...asReturnRider, returnStatus: { $in: ACTIVE_RETURN_STATUSES } },
                ],
            };
        } else if (normalized === "today") {
            query = {
                $or: [
                    { $and: [asDeliveryRider, isDelivered, { deliveredAt: { $gte: today } }] },
                    { ...asReturnRider, returnStatus: { $in: DONE_RETURN_STATUSES }, returnDeliveredBackAt: { $gte: today } },
                ],
            };
        } else {
            query = { $or: [asDeliveryRider, asReturnRider] };
        }

        const orders = await Order.find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(100)
            .populate("seller", "shopName address")
            .populate("customer", "name phone")
            .lean();

        const keepTask = {
            active: (t) => t.state === "active",
            today: (t) => t.state === "done" && t.at && new Date(t.at) >= today,
            delivered: (t) => t.kind === "delivery" && t.state === "done",
            cancelled: (t) => t.kind === "delivery" && t.state === "cancelled",
            returns: (t) => t.kind === "return",
        }[normalized];

        const result = orders
            .map((o) => {
                const all = riderTasksFor(o, deliveryBoyId, winnerSet);
                return { ...o, riderTasks: keepTask ? all.filter(keepTask) : all };
            })
            .filter((o) => o.riderTasks.length > 0);

        return handleResponse(res, 200, "Delivery orders fetched", result);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   REQUEST WITHDRAWAL (Delivery)
================================ */
export const requestWithdrawal = async (req, res) => {
    try {
        const deliveryBoyId = req.user.id;
        const { amount } = req.body;

        if (!amount || amount <= 0 || !Number.isFinite(Number(amount))) {
            return handleResponse(res, 400, "Please enter a valid amount");
        }

        const requestAmount = Number(amount);

        // Audit fix M2: serialize the read-check-write sequence per rider so
        // two concurrent withdrawal requests can't both read the same
        // available balance before either write becomes visible to the
        // other. See app/utils/distributedLock.js for details.
        const withdrawal = await withLock(
            `withdrawal:lock:delivery:${deliveryBoyId}`,
            10_000,
            async () => {
                // 1. Calculate current available balance
                const { availableBalance } = await getDeliveryWithdrawableBalance(deliveryBoyId);

                if (requestAmount > availableBalance) {
                    const err = new Error(`Insufficient balance. Available: ₹${availableBalance}`);
                    err.statusCode = 400;
                    throw err;
                }

                // 2. Create Withdrawal Transaction
                return Transaction.create({
                    user: deliveryBoyId,
                    userModel: "Delivery",
                    type: "Withdrawal",
                    amount: -Math.abs(requestAmount),
                    status: "Pending",
                    reference: `WDR-DL-${Date.now()}`
                });
            },
        );

        // Drop the cached earnings so the balance reflects this request now.
        await invalidate(buildKey("delivery", "earnings", String(deliveryBoyId)));

        return handleResponse(res, 201, "Withdrawal request submitted successfully", withdrawal);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   UPDATE LIVE LOCATION (Delivery)
================================ */
export const updateDeliveryLocation = async (req, res) => {
    try {
        const deliveryId = req.user.id;
        const { lat, lng, accuracy, heading, speed, orderId } = req.body || {};

        if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            Number.isNaN(lat) ||
            Number.isNaN(lng)
        ) {
            return handleResponse(res, 400, "Valid numeric lat and lng are required");
        }

        const throttled = await throttleLocationUpdate(deliveryId, lat, lng);
        if (throttled) {
            return handleResponse(res, 200, "Location update throttled", {
                throttled: true,
            });
        }

        // Normalize to [lng, lat] as required by GeoJSON
        const coordinates = [Number(lng), Number(lat)];

        const delivery = await Delivery.findByIdAndUpdate(
            deliveryId,
            {
                $set: {
                    location: {
                        type: "Point",
                        coordinates,
                    },
                    lastLocationAt: new Date(),
                },
            },
            { new: true }
        ).select("_id location isOnline");

        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        // SECURITY: when an orderId is supplied, the rider is telling us which
        // active delivery this ping belongs to. We MUST verify the assignment
        // synchronously before fanning out to Firebase — otherwise a rider can
        // pollute another order's live-tracking path (and the customer map
        // would render the wrong rider). The previous fire-and-forget check
        // ran *after* the Firebase write and never blocked anything.
        //
        // Rules:
        //   - orderId omitted          -> only the delivery-keyed RTDB entry is
        //                                 written (no per-order fanout). Trail
        //                                 is skipped. This preserves the
        //                                 "background heartbeat" code path.
        //   - orderId references a doc -> rider must equal order.deliveryBoy,
        //                                 otherwise 403/404 and no RTDB write.
        //   - canonical orderId        -> always read from Mongo, never from
        //                                 the request body, so the RTDB path
        //                                 cannot be spoofed via case-drift or
        //                                 alternate ids.
        let activeOrderId = null;
        if (orderId) {
            const orderMatch = orderMatchQueryFromRouteParam(orderId);
            if (!orderMatch) {
                return handleResponse(res, 400, "Invalid orderId");
            }

            const order = await Order.findOne(orderMatch)
                .select("orderId deliveryBoy")
                .lean();

            if (!order) {
                return handleResponse(res, 404, "Order not found");
            }

            const assignedRiderId = order.deliveryBoy
                ? String(order.deliveryBoy)
                : null;
            if (assignedRiderId !== String(deliveryId)) {
                return handleResponse(
                    res,
                    403,
                    "Order is not assigned to this delivery partner"
                );
            }

            activeOrderId = order.orderId;
        }

        const snapshot = {
            lat,
            lng,
            accuracy: typeof accuracy === "number" ? accuracy : undefined,
            heading: typeof heading === "number" ? heading : undefined,
            speed: typeof speed === "number" ? speed : undefined,
            lastUpdatedAt: new Date().toISOString(),
            deliveryId,
            orderId: activeOrderId,
        };

        // Heartbeats from the rider app's layout carry no orderId (only the map
        // screen sends one), so the customer's live map froze whenever the rider
        // left that screen. Resolve the rider's OWN in-progress deliveries
        // server-side — still spoof-proof, since we only use orders assigned to
        // this rider — and fan the ping out to each of them.
        let fanoutOrderIds = activeOrderId ? [activeOrderId] : [];
        if (!activeOrderId) {
            const inProgress = await Order.find({
                deliveryBoy: deliveryId,
                workflowStatus: {
                    $in: [
                        WORKFLOW_STATUS.DELIVERY_ASSIGNED,
                        WORKFLOW_STATUS.PICKUP_READY,
                        WORKFLOW_STATUS.OUT_FOR_DELIVERY,
                    ],
                },
            })
                .select("orderId")
                .sort({ updatedAt: -1 })
                .limit(5)
                .lean();
            fanoutOrderIds = inProgress.map((o) => o.orderId).filter(Boolean);
        }

        // Fan out to Firebase and trail — fire-and-forget, never block the
        // response. Every id here is an order this rider is actually assigned to.
        if (fanoutOrderIds.length === 0) {
            writeDeliveryLocation(deliveryId, null, snapshot).catch(() => {});
        }
        for (const oid of fanoutOrderIds) {
            writeDeliveryLocation(deliveryId, oid, { ...snapshot, orderId: oid }).catch(() => {});
            appendTrailPoint(oid, { lat, lng, t: Date.now() }).catch(() => {});
        }
        activeOrderId = activeOrderId || fanoutOrderIds[0] || null;

        return handleResponse(res, 200, "Location updated", {
            location: delivery.location,
            activeOrderId,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
/*
 * DEPRECATED + REMOVED: Delivery-completion OTP generation/validation moved
 * to the canonical workflow service:
 *   POST /orders/workflow/:orderId/otp/request  -> requestHandoffOtpAtomic
 *   POST /orders/workflow/:orderId/otp/verify   -> verifyHandoffOtpAndDeliver
 *
 * The previous generateDeliveryOtp / validateDeliveryOtp controllers
 * and their /delivery/orders/:orderId/(generate|validate)-otp routes
 * were removed once the workflow state machine became the single source
 * of truth for delivery completion. All behaviors (Delivery.location
 * fallback, proximity check, Firebase tracking cleanup on success,
 * structured OTP error codes, otpValidatedAt + otpValidationLocation
 * persistence, delivery:otp:validated socket fan-out) now live in
 * app/services/orderWorkflowService.js.
 */