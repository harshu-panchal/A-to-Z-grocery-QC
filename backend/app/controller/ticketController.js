import mongoose from "mongoose";
import Ticket from "../models/ticket.js";
import Admin from "../models/admin.js";
import User from "../models/customer.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { escapeRegex } from "../utils/regex.js";
import {
    emitTicketCreated,
    emitTicketMessage,
    emitTicketStatus,
} from "../services/ticketSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

// Ticket.userType values per login role. Customers keep the legacy
// "Customer" label because the admin UI and existing rows use it.
const USER_TYPE_BY_ROLE = {
    customer: "Customer",
    user: "Customer",
    seller: "Seller",
    delivery: "Delivery",
};

// Admin filter value -> stored values (legacy aliases included).
const USER_TYPE_FILTER = {
    Customer: ["Customer", "User"],
    Seller: ["Seller"],
    Delivery: ["Delivery", "Rider"],
};

function recipientRoleFor(userType) {
    if (userType === "Seller") return "seller";
    if (userType === "Delivery" || userType === "Rider") return "delivery";
    return "customer";
}

async function getAdminIds() {
    const admins = await Admin.find().select("_id").lean();
    return (admins || []).map((a) => a?._id).filter(Boolean);
}

// Only the order's own customer or seller may raise a ticket about it.
async function findOwnedOrder(rawOrderId, req) {
    const raw = String(rawOrderId || "").trim();
    if (!raw) return null;
    const query = mongoose.Types.ObjectId.isValid(raw)
        ? { $or: [{ _id: raw }, { orderId: raw }] }
        : { orderId: raw };
    const order = await Order.findOne(query).select("_id orderId customer seller").lean();
    if (!order) return { error: "Order not found" };

    const uid = String(req.user.id);
    const role = req.user.role;
    const owns =
        ((role === "customer" || role === "user") && String(order.customer) === uid) ||
        (role === "seller" && String(order.seller) === uid);
    if (!owns) return { error: "This order does not belong to your account" };
    return { order };
}

// Ticket.userId points at a different collection per userType, so resolve
// display names manually instead of a single populate().
async function attachUsers(tickets) {
    const idsByModel = { User: new Set(), Seller: new Set(), Delivery: new Set() };
    const modelFor = (t) =>
        t.userType === "Seller" ? "Seller" : t.userType === "Delivery" || t.userType === "Rider" ? "Delivery" : "User";
    tickets.forEach((t) => t.userId && idsByModel[modelFor(t)].add(String(t.userId)));

    const [users, sellers, riders] = await Promise.all([
        User.find({ _id: { $in: [...idsByModel.User] } }).select("name email phone").lean(),
        Seller.find({ _id: { $in: [...idsByModel.Seller] } }).select("name shopName email phone").lean(),
        Delivery.find({ _id: { $in: [...idsByModel.Delivery] } }).select("name phone").lean(),
    ]);
    const byId = new Map();
    users.forEach((u) => byId.set(`User:${u._id}`, u));
    sellers.forEach((s) => byId.set(`Seller:${s._id}`, { ...s, name: s.shopName || s.name }));
    riders.forEach((d) => byId.set(`Delivery:${d._id}`, d));

    return tickets.map((t) => {
        const id = t.userId ? String(t.userId) : "";
        const info = byId.get(`${modelFor(t)}:${id}`);
        return { ...t, userId: info ? { _id: id, ...info } : t.userId };
    });
}

// Create a new ticket (Customer / Seller / Delivery)
export const createTicket = async (req, res) => {
    try {
        const { subject, description, priority, category, orderId, mediaUrl, mediaType, mimeType } = req.body;
        const userId = req.user.id;
        const userType = USER_TYPE_BY_ROLE[req.user.role];
        if (!userType) return handleResponse(res, 403, "Only customers, sellers and delivery partners can raise tickets");

        let order = null;
        if (orderId) {
            const found = await findOwnedOrder(orderId, req);
            if (found?.error) return handleResponse(res, 400, found.error);
            order = found.order;

            // One open ticket per order: send the user back to the existing chat.
            const existing = await Ticket.findOne({
                userId,
                orderId: order.orderId,
                status: { $ne: "closed" },
            }).select("_id").lean();
            if (existing) {
                return handleResponse(res, 409, "You already have an open ticket for this order", {
                    ticketId: existing._id,
                });
            }
        }

        const safeMediaUrl = String(mediaUrl || "").trim();
        const safeMediaType = String(mediaType || "").trim();
        const safeMimeType = String(mimeType || "").trim();

        const newTicket = new Ticket({
            userId,
            userType,
            subject,
            description,
            priority,
            category: category || (order ? "order" : "general"),
            orderId: order?.orderId || "",
            order: order?._id || null,
            messages: [
                {
                    sender: req.user.name || "User",
                    senderId: userId,
                    senderType: "User",
                    text: description,
                    mediaUrl: safeMediaUrl,
                    mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
                    mimeType: safeMediaUrl ? safeMimeType : "",
                    isAdmin: false,
                },
            ],
        });

        await newTicket.save();
        emitTicketCreated(newTicket);

        try {
            const savedMessage = newTicket.messages?.[newTicket.messages.length - 1];
            const adminIds = await getAdminIds();
            emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, {
                fromRole: recipientRoleFor(userType),
                ticketId: newTicket._id,
                messageId: savedMessage?._id,
                messageCreatedAt: savedMessage?.createdAt,
                userId,
                userName: req.user.name || userType,
                adminIds,
                messageText: description || (safeMediaUrl ? "Sent an image" : ""),
                data: { subject, orderId: newTicket.orderId || undefined },
            });
        } catch {
            // Push notifications are best-effort; never block ticket creation.
        }

        return handleResponse(res, 201, "Ticket created successfully", newTicket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Get all tickets for current user (optionally for one order)
export const getMyTickets = async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        if (req.query.orderId) filter.orderId = String(req.query.orderId).trim();
        const tickets = await Ticket.find(filter).sort({ updatedAt: -1 });
        return handleResponse(res, 200, "Tickets fetched successfully", tickets);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: list tickets with filters + search across all pages
export const getAllTickets = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });
        const { status, userType, category, priority } = req.query;
        const search = String(req.query.search || "").trim();

        const filter = {};
        if (["open", "processing", "closed"].includes(status)) filter.status = status;
        if (status === "active") filter.status = { $ne: "closed" };
        if (USER_TYPE_FILTER[userType]) filter.userType = { $in: USER_TYPE_FILTER[userType] };
        if (category) filter.category = String(category);
        if (["low", "medium", "high"].includes(priority)) filter.priority = priority;

        if (search) {
            const rx = new RegExp(escapeRegex(search), "i");
            const [users, sellers, riders] = await Promise.all([
                User.find({ $or: [{ name: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
                Seller.find({ $or: [{ name: rx }, { shopName: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
                Delivery.find({ $or: [{ name: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
            ]);
            const userIds = [...users, ...sellers, ...riders].map((u) => u._id);
            const or = [{ subject: rx }, { orderId: rx }, { userId: { $in: userIds } }];
            if (mongoose.Types.ObjectId.isValid(search)) or.push({ _id: search });
            filter.$or = or;
        }

        const [tickets, total] = await Promise.all([
            Ticket.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
            Ticket.countDocuments(filter),
        ]);

        return handleResponse(res, 200, "All tickets fetched successfully", {
            items: await attachUsers(tickets),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin/User: Reply to a ticket
export const replyToTicket = async (req, res) => {
    try {
        const { text, mediaUrl, mediaType, mimeType } = req.body;
        const { id } = req.params;

        const ticket = await Ticket.findById(id);
        if (!ticket) return handleResponse(res, 404, "Ticket not found");

        // Audit fix H1: `isAdmin` comes from the verified JWT role, and only
        // the ticket owner or an admin may reply.
        const isAdmin = req.user.role === "admin";
        if (!isAdmin && String(ticket.userId) !== String(req.user.id)) {
            return handleResponse(res, 403, "You do not have access to this ticket");
        }

        const safeText = String(text || "").trim();
        const safeMediaUrl = String(mediaUrl || "").trim();
        const safeMediaType = String(mediaType || "").trim();
        const safeMimeType = String(mimeType || "").trim();

        if (!safeText && !safeMediaUrl) {
            return handleResponse(res, 400, "Message text or mediaUrl is required");
        }

        const newMessage = {
            sender: isAdmin ? "Admin" : (req.user.name || "User"),
            senderId: req.user.id,
            senderType: isAdmin ? "Admin" : "User",
            text: safeText,
            mediaUrl: safeMediaUrl,
            mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
            mimeType: safeMediaUrl ? safeMimeType : "",
            isAdmin,
        };

        const previousStatus = ticket.status;
        ticket.messages.push(newMessage);
        if (isAdmin) {
            ticket.status = "processing";
        } else if (ticket.status === "closed") {
            // A user writing on a closed ticket reopens it so admins see it.
            ticket.status = "open";
        }

        await ticket.save();

        const savedMessage = ticket.messages[ticket.messages.length - 1];
        emitTicketMessage({
            ticketId: ticket._id,
            userId: ticket.userId,
            userType: ticket.userType,
            message: typeof savedMessage?.toObject === "function" ? savedMessage.toObject() : savedMessage,
        });
        if (previousStatus !== ticket.status) emitTicketStatus(ticket);

        try {
            const userRole = recipientRoleFor(ticket.userType);
            const payload = {
                fromRole: isAdmin ? "admin" : userRole,
                recipientRole: userRole,
                ticketId: ticket._id,
                messageId: savedMessage?._id,
                messageCreatedAt: savedMessage?.createdAt,
                userId: ticket.userId,
                userName: req.user.name || ticket.userType || "User",
                messageText: safeText || (safeMediaUrl ? "Sent an image" : ""),
                data: { subject: ticket.subject },
            };
            if (!isAdmin) payload.adminIds = await getAdminIds();
            emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, payload);
        } catch {
            // Best-effort; chat must work even if push is misconfigured.
        }

        return handleResponse(res, 200, "Reply sent successfully", ticket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Update status (user is told live + by push when closed/reopened)
export const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        const ticket = await Ticket.findByIdAndUpdate(id, { status }, { new: true });
        if (!ticket) return handleResponse(res, 404, "Ticket not found");

        emitTicketStatus(ticket);

        if (status === "closed" || status === "open") {
            try {
                emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, {
                    fromRole: "admin",
                    recipientRole: recipientRoleFor(ticket.userType),
                    ticketId: ticket._id,
                    userId: ticket.userId,
                    messageText:
                        status === "closed"
                            ? `Your ticket "${ticket.subject}" has been resolved and closed.`
                            : `Your ticket "${ticket.subject}" has been reopened.`,
                    data: { subject: ticket.subject },
                });
            } catch {
                // Best-effort.
            }
        }

        return handleResponse(res, 200, `Ticket status updated to ${status}`, ticket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
