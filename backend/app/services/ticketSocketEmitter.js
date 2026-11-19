/**
 * Emits Socket.IO events for support tickets. Safe if socket not initialized.
 */

let _getIo = null;

export function registerTicketSocketGetter(fn) {
  _getIo = fn;
}

function getIo() {
  try {
    return _getIo ? _getIo() : null;
  } catch {
    return null;
  }
}

function safeToString(value) {
  if (value == null) return "";
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

// Personal socket room of the ticket owner (see socketManager.js).
function ownerRoom(userType, userId) {
  if (!userId) return "";
  if (userType === "Seller") return `seller:${userId}`;
  if (userType === "Delivery" || userType === "Rider") return `delivery:${userId}`;
  return `customer:${userId}`;
}

export function emitTicketCreated(ticket) {
  const io = getIo();
  if (!io || !ticket) return;

  const ticketId = safeToString(ticket._id || ticket.id);
  const userId = safeToString(ticket.userId);
  const payload = {
    ticketId,
    status: ticket.status,
    priority: ticket.priority,
    subject: ticket.subject,
    category: ticket.category,
    orderId: ticket.orderId || "",
    userType: ticket.userType,
    userId,
    at: new Date().toISOString(),
  };

  if (ticketId) io.to(`ticket:${ticketId}`).emit("ticket:created", payload);
  const room = ownerRoom(ticket.userType, userId);
  if (room) io.to(room).emit("ticket:created", payload);
  io.to("admin:support").emit("ticket:created", payload);
}

export function emitTicketMessage({ ticketId, userId, userType, message }) {
  const io = getIo();
  if (!io) return;

  const tid = safeToString(ticketId);
  const uid = safeToString(userId);
  if (!tid) return;

  const payload = {
    ticketId: tid,
    message,
    at: new Date().toISOString(),
  };

  io.to(`ticket:${tid}`).emit("ticket:message", payload);
  const room = ownerRoom(userType, uid);
  if (room) io.to(room).emit("ticket:message", payload);
  io.to("admin:support").emit("ticket:message", payload);
}


export function emitTicketStatus(ticket) {
  const io = getIo();
  if (!io || !ticket) return;

  const ticketId = safeToString(ticket._id || ticket.id);
  if (!ticketId) return;
  const payload = { ticketId, status: ticket.status, at: new Date().toISOString() };

  io.to(`ticket:${ticketId}`).emit("ticket:status", payload);
  const room = ownerRoom(ticket.userType, safeToString(ticket.userId));
  if (room) io.to(room).emit("ticket:status", payload);
  io.to("admin:support").emit("ticket:status", payload);
}
