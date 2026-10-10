import Product from "../models/product.js";
import StockHistory from "../models/stockHistory.js";
import handleResponse from "../utils/helper.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import {
    createLowStockAlertCandidate,
    isLowStockAlertsEnabled,
} from "../services/lowStockAlertService.js";
import { invalidate, buildKey } from "../services/cacheService.js";

/* ===============================
   ADJUST STOCK MANUALLY
================================ */
const MAX_ADJUST_QTY = 100000;

export const adjustStock = async (req, res) => {
    try {
        const { productId, type, quantity, note } = req.body;
        const sellerId = req.user.id;

        // "Restock" adds; "Remove" (or legacy "Correction") subtracts. The quantity is
        // always treated as a positive amount — the old page sent Remove as a negative
        // number and `stock - (-n)` silently ADDED stock.
        const isRestock = type === "Restock";
        if (!isRestock && type !== "Remove" && type !== "Correction") {
            return handleResponse(res, 400, "type must be Restock or Remove");
        }
        const qty = Math.abs(Number(quantity));
        if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ADJUST_QTY) {
            return handleResponse(res, 400, `Quantity must be a whole number between 1 and ${MAX_ADJUST_QTY}`);
        }
        const delta = isRestock ? qty : -qty;

        const product = await Product.findOne({ _id: productId, sellerId })
            .select("name stock lowStockAlert variants sellerId")
            .lean();
        if (!product) {
            return handleResponse(res, 404, "Product not found or unauthorized");
        }

        // Products with variants: the variant's stock and the master stock move
        // together (same as order placement in stockService), otherwise checkout —
        // which requires both — would still treat a "restocked" product as sold out.
        const variants = Array.isArray(product.variants) ? product.variants : [];
        let variantSku = String(req.body.variantSku || "").trim();
        if (variants.length === 1 && !variantSku) variantSku = String(variants[0].sku || "").trim();
        if (variants.length > 1 && !variantSku) {
            return handleResponse(res, 400, "Select which variant to adjust");
        }
        const variant = variantSku ? variants.find((v) => String(v.sku || "").trim() === variantSku) : null;
        if (variantSku && !variant) {
            return handleResponse(res, 400, "Variant not found on this product");
        }

        const previousStock = Number(product.stock || 0);

        // Atomic $inc with guards: never lost-updates a concurrent order, and a
        // removal can't take stock below zero.
        const filter = { _id: productId, sellerId };
        const inc = { stock: delta };
        if (variant) {
            filter.variants = isRestock
                ? { $elemMatch: { sku: variant.sku } }
                : { $elemMatch: { sku: variant.sku, stock: { $gte: qty } } };
            inc["variants.$.stock"] = delta;
        }
        if (!isRestock) filter.stock = { $gte: qty };

        const updated = await Product.findOneAndUpdate(filter, { $inc: inc }, { new: true })
            .select("name stock lowStockAlert variants sellerId")
            .lean();

        if (!updated) {
            const available = variant ? Number(variant.stock || 0) : previousStock;
            return handleResponse(
                res,
                400,
                `Cannot remove ${qty}: only ${available} in stock${variant ? ` for ${variant.name || variant.sku}` : ""}`,
            );
        }

        const variantLabel = variant ? ` [${variant.name || variant.sku}]` : "";
        const historyEntry = await StockHistory.create({
            product: productId,
            seller: sellerId,
            type: isRestock ? "Restock" : "Correction",
            quantity: delta,
            note: (note && String(note).trim()) || `Manual ${isRestock ? "restock" : "removal"}${variantLabel}`,
        });
        const finalStock = Number(updated.stock || 0);
        const updatedVariant = variant
            ? (updated.variants || []).find((v) => v.sku === variant.sku)
            : null;

        // Audit fix: manual stock adjustments (seller restock/correction)
        // never invalidated the product cache, so a just-restocked product
        // could still show as out-of-stock (or a just-zeroed product still
        // show as available) for up to the 5-minute cache TTL — the same
        // gap as the order-driven stock paths in stockService.js.
        await invalidate(`cache:catalog:product:${productId}`);
        await invalidate(buildKey("catalog", "productList", "*"));

        if (!isRestock && await isLowStockAlertsEnabled()) {
            const lowStockAlert = createLowStockAlertCandidate({
                product: updated,
                previousStock,
                currentStock: finalStock,
            });
            if (lowStockAlert) {
                emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, lowStockAlert);
            }
        }

        return handleResponse(res, 200, "Stock adjusted successfully", {
            newStock: finalStock,
            variantSku: updatedVariant?.sku || null,
            newVariantStock: updatedVariant ? Number(updatedVariant.stock || 0) : null,
            historyEntry
        });

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET STOCK HISTORY LOG
================================ */
export const getStockHistory = async (req, res) => {
    try {
        const sellerId = req.user.id;

        const history = await StockHistory.find({ seller: sellerId })
            .sort({ createdAt: -1 })
            .populate("product", "name sku mainImage");

        return handleResponse(res, 200, "Stock history fetched", history.map(item => ({
            id: item._id,
            productName: item.product?.name || "Deleted Product",
            sku: item.product?.sku || "N/A",
            type: item.type,
            quantity: item.quantity > 0 ? `+${item.quantity}` : `${item.quantity}`,
            date: item.createdAt.toISOString().split('T')[0],
            time: item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            note: item.note
        })));

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
