/**
 * Socket.IO — order rooms, role rooms, JWT auth.
 */
import { verifySocketToken } from "./socketAuth.js";
import mongoose from "mongoose";
import Ticket from "../models/ticket.js";
import Order from "../models/order.js";

let _io = null;

const deliverySockets = new Map();

export const initSocket = (io) => {
  _io = io;

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      null;
    if (!token) {
      socket.user = null;
      return next();
    }
    const user = verifySocketToken(token);
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    socket.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const { id: userId, role } = socket.user || {};
    if (!userId) {
      return;
    }

    if (role === "delivery") {
      const dId = userId.toString();
      deliverySockets.set(dId, socket.id);
      socket.join("delivery:online");
      socket.join(`delivery:${dId}`);
    }
    if (role === "seller") {
      socket.join(`seller:${userId}`);
    }
    if (role === "customer" || role === "user") {
      socket.join(`customer:${userId}`);
    }
    if (role === "admin") {
      socket.join("admin:orders");
      socket.join("admin:support");
      // Per-admin room — used by the notification service to push
      // `notification:new` deltas to the specific admin who owns the
      // Notification row, so the topbar can refresh without polling.
      socket.join(`admin:${userId}`);
    }

    // Audit fix M1: previously joined `order:${orderId}` for any string,
    // with no ownership check — any authenticated (or even anonymous,
    // since `socket.user` may be null) socket could receive live status
    // updates for an order that wasn't theirs just by guessing/knowing its
    // id. Mirrors the `join_ticket` handler below: admins can join any
    // order room, everyone else must own the order (as customer, seller,
    // or assigned delivery partner).
    socket.on("join_order", async (orderId) => {
      const raw = typeof orderId === "string" ? orderId.trim() : "";
      if (!raw) return;

      if (socket.user?.role === "admin") {
        socket.join(`order:${raw}`);
        return;
      }

      if (!userId) return;

      try {
        const query = mongoose.Types.ObjectId.isValid(raw)
          ? { $or: [{ _id: raw }, { orderId: raw }] }
          : { orderId: raw };
        const order = await Order.findOne(query)
          .select("customer seller deliveryBoy deliveryPartner")
          .lean();
        if (!order) return;

        const ownerIds = [order.customer, order.seller, order.deliveryBoy, order.deliveryPartner]
          .filter(Boolean)
          .map((id) => id.toString());
        if (!ownerIds.includes(userId.toString())) return;

        socket.join(`order:${raw}`);
      } catch {
        /* ignore */
      }
    });

    socket.on("leave_order", (orderId) => {
      if (!orderId) return;
      socket.leave(`order:${orderId}`);
    });

    socket.on("join_ticket", async (ticketId) => {
      const raw = typeof ticketId === "string" ? ticketId.trim() : "";
      if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return;

      if (socket.user?.role === "admin") {
        socket.join(`ticket:${raw}`);
        return;
      }

      try {
        const ticket = await Ticket.findById(raw).select("userId").lean();
        if (!ticket?.userId) return;
        if (ticket.userId.toString() !== userId.toString()) return;
        socket.join(`ticket:${raw}`);
      } catch {
        /* ignore */
      }
    });

    socket.on("leave_ticket", (ticketId) => {
      if (!ticketId) return;
      socket.leave(`ticket:${String(ticketId).trim()}`);
    });

    socket.on("register_delivery", (deliveryId) => {
      if (deliveryId && socket.user?.role === "delivery") {
        deliverySockets.set(deliveryId.toString(), socket.id);
      }
    });

    socket.on("disconnect", () => {
      for (const [id, sid] of deliverySockets.entries()) {
        if (sid === socket.id) {
          deliverySockets.delete(id);
          break;
        }
      }
    });
  });
};

export const getIO = () => {
  if (!_io) throw new Error("Socket.IO not initialized");
  return _io;
};

export const notifyDeliveryPartners = (orderData) => {
  if (!_io) return;
  _io.to("delivery:online").emit("new_order_packed", orderData);
};
