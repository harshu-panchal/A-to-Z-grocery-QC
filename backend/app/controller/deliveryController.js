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
import { roundCurrency } from "../utils/money.js";
import { shouldThrottle as throttleLocationUpdate } from "../services/delivery/locationThrottleService.js";
import {
  getDeliveryStats as getDeliveryStatsFromService,
  getDeliveryEarnings as getDeliveryEarningsFromService,
  getDeliveryCodCashSummary as getDeliveryCodCashSummaryFromService,
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

/* ===============================
   SUBMIT DELIVERY COD CASH
================================ */
export const submitDeliveryCodCashToAdmin = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }

        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
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

        if (!orders.length) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        const totalAvailable = roundCurrency(
            orders.reduce(
                (sum, order) => sum + Number(order?.paymentBreakdown?.codPendingAmount || 0),
                0,
            ),
        );
        const requestedRaw = req.body?.amount;
        const requestedAmount =
            requestedRaw == null || requestedRaw === ""
                ? null
                : roundCurrency(requestedRaw);

        if (requestedAmount != null && (!Number.isFinite(Number(requestedRaw)) || requestedAmount <= 0)) {
            return handleResponse(res, 400, "Enter a valid amount to submit");
        }

        const amountToSubmit = requestedAmount == null ? totalAvailable : requestedAmount;
        if (amountToSubmit <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }
        if (amountToSubmit > totalAvailable) {
            return handleResponse(
                res,
                400,
                `You can submit up to ${String.fromCharCode(8377)}${totalAvailable.toLocaleString()}`,
            );
        }

        const settledOrders = [];
        let totalSubmitted = 0;
        let remaining = amountToSubmit;

        for (const order of orders) {
            const amount = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
            if (amount <= 0 || remaining <= 0) continue;
            const settleAmount = roundCurrency(Math.min(amount, remaining));

            await reconcileCodCash(
                order._id,
                settleAmount,
                deliveryBoyId,
                {
                    actorId: req.user?.id || null,
                    metadata: {
                        source: "delivery_cod_cash_page",
                        initiatedBy: "delivery_partner",
                    },
                },
            );

            totalSubmitted = roundCurrency(totalSubmitted + settleAmount);
            remaining = roundCurrency(remaining - settleAmount);
            settledOrders.push({
                orderId: order.orderId,
                amount: settleAmount,
            });
        }

        if (totalSubmitted <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Cash Settlement",
            amount: -Math.abs(totalSubmitted),
            status: "Settled",
            reference: `CSH-SET-${deliveryBoyId}-${Date.now()}`,
            meta: {
                source: "delivery_cod_cash_page",
                orders: settledOrders.map((item) => item.orderId),
            },
        });

        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();

        return handleResponse(res, 200, "COD cash submitted to admin successfully", {
            totalSubmitted,
            orderCount: settledOrders.length,
            orders: settledOrders,
            cashInHand: roundCurrency(wallet?.cashInHand || 0),
        });
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
                const transactions = await Transaction.find({ user: deliveryBoyId, userModel: 'Delivery' });

                const settledBalance = transactions
                    .filter(t => t.status === 'Settled')
                    .reduce((acc, t) => acc + t.amount, 0);

                const pendingPayouts = transactions
                    .filter(t => (t.status === 'Pending' || t.status === 'Processing') && t.type === 'Withdrawal')
                    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

                const availableBalance = settledBalance - pendingPayouts;

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