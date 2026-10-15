import Payout from "../models/payout.js";
import Wallet from "../models/wallet.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import handleResponse from "../utils/helper.js";
import { getAdminFinanceSummary } from "../services/finance/walletService.js";
import { getLedgerEntries } from "../services/finance/ledgerService.js";
import { bulkProcessPayouts } from "../services/finance/payoutService.js";
import { exportFinanceStatement } from "../services/finance/statementService.js";
import {
  FINANCE_AUDIT_ACTION,
  OWNER_TYPE,
} from "../constants/finance.js";
import {
  getOrCreateFinanceSettings,
  updateDeliveryFinanceSettings,
} from "../services/finance/financeSettingsService.js";
import { createFinanceAuditLog } from "../services/finance/auditLogService.js";
import FinanceAuditLog from "../models/financeAuditLog.js";
import Admin from "../models/admin.js";
import {
  financeLedgerQuerySchema,
  payoutProcessSchema,
  updateDeliverySettingsSchema,
} from "../validation/financeValidation.js";
import { validateBodySafe as validateWithJoi } from "../middleware/validate.js";

export const getAdminFinanceSummaryController = async (req, res) => {
  try {
    const summary = await getAdminFinanceSummary();
    return handleResponse(res, 200, "Admin finance summary fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinanceLedgerController = async (req, res) => {
  try {
    const validated = validateWithJoi(financeLedgerQuerySchema, req.query || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const ledger = await getLedgerEntries(validated.value);
    return handleResponse(res, 200, "Finance ledger fetched", ledger);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinancePayoutsController = async (req, res) => {
  try {
    const {
      seller,
      rider,
      status,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};
    if (status) query.status = status;

    const includeSeller = String(seller).toLowerCase() === "true";
    const includeRider = String(rider).toLowerCase() === "true";
    if (includeSeller && !includeRider) query.payoutType = "SELLER";
    if (!includeSeller && includeRider) query.payoutType = "DELIVERY_PARTNER";

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [rawItems, total] = await Promise.all([
      Payout.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("relatedOrderIds", "orderId paymentMode paymentStatus status")
        .lean(),
      Payout.countDocuments(query),
    ]);

    const sellerIds = rawItems
      .filter((item) => item.payoutType === "SELLER")
      .map((item) => item.beneficiaryId);
    const riderIds = rawItems
      .filter((item) => item.payoutType === "DELIVERY_PARTNER")
      .map((item) => item.beneficiaryId);

    const [sellers, riders] = await Promise.all([
      Seller.find({ _id: { $in: sellerIds } })
        .select("_id shopName name phone")
        .lean(),
      Delivery.find({ _id: { $in: riderIds } })
        .select("_id name phone")
        .lean(),
    ]);

    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));

    const items = rawItems.map((item) => {
      const beneficiary =
        item.payoutType === "SELLER"
          ? sellerMap.get(String(item.beneficiaryId))
          : riderMap.get(String(item.beneficiaryId));
      return {
        ...item,
        beneficiary: beneficiary || null,
      };
    });

    return handleResponse(res, 200, "Finance payouts fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const processAdminFinancePayoutsController = async (req, res) => {
  try {
    const validated = validateWithJoi(payoutProcessSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }

    const result = await bulkProcessPayouts({
      payoutIds: validated.value.payoutIds,
      payoutType: validated.value.payoutType,
      limit: validated.value.limit,
      remarks: validated.value.remarks || "",
      adminId: req.user?.id || null,
    });

    return handleResponse(res, 200, "Payout processing completed", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Recent finance audit trail (settings changes, payouts, adjustments). */
export const getAdminFinanceAuditLogsController = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const filter = {};
    if (req.query.action) {
      const actions = String(req.query.action).split(",").filter(Boolean);
      filter.action = { $in: actions };
    }
    const logs = await FinanceAuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    const adminIds = [...new Set(logs.filter((l) => l.actorType === OWNER_TYPE.ADMIN && l.actorId).map((l) => String(l.actorId)))];
    const admins = adminIds.length ? await Admin.find({ _id: { $in: adminIds } }).select("name email").lean() : [];
    const names = new Map(admins.map((a) => [String(a._id), a.name || a.email]));
    const items = logs.map((l) => ({
      id: l._id,
      action: l.action,
      actorType: l.actorType,
      actorName: l.actorId ? names.get(String(l.actorId)) || null : null,
      metadata: l.metadata || {},
      note: l.note || "",
      orderId: l.orderId,
      payoutId: l.payoutId,
      createdAt: l.createdAt,
    }));
    return handleResponse(res, 200, "Audit logs fetched", { items });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const exportAdminFinanceStatementController = async (req, res) => {
  try {
    const statement = await exportFinanceStatement(req.query || {});
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${statement.fileName}"`,
    );
    return res.status(200).send(statement.csv);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliverySettingsController = async (req, res) => {
  try {
    const settings = await getOrCreateFinanceSettings();
    return handleResponse(res, 200, "Delivery finance settings fetched", settings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliverySettingsController = async (req, res) => {
  try {
    const validated = validateWithJoi(updateDeliverySettingsSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const updated = await updateDeliveryFinanceSettings(validated.value);
    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.DELIVERY_SETTINGS_UPDATED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      metadata: {
        updatedFields: Object.keys(validated.value || {}),
      },
    });
    return handleResponse(res, 200, "Delivery finance settings updated", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerWalletSummaryController = async (req, res) => {
  try {
    const sellerId = req.user?.id;
    const wallet = await Wallet.findOne({ ownerType: "SELLER", ownerId: sellerId }).lean();
    return handleResponse(res, 200, "Seller wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getRiderWalletSummaryController = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const wallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: riderId,
    }).lean();
    return handleResponse(res, 200, "Rider wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      cashInHand: wallet?.cashInHand || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
