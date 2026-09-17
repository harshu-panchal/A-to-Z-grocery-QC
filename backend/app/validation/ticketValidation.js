/**
 * Joi schemas for support-ticket endpoints.
 * Refactor P5.2. Opt-in adoption — see orderValidation.js header.
 */
import Joi from "joi";

const trimmedString = Joi.string().trim();

// Audit fix H4: these schemas previously existed but were never wired into
// ticketRoutes.js, and had drifted from the real `Ticket` model (models/
// ticket.js) enums — `priority` allowed "urgent" (not a valid model value)
// and `status` used an entirely different vocabulary ("in_progress" /
// "resolved" / "reopened") than what the model and the admin UI actually
// use ("open" / "processing" / "closed", see SupportTickets.jsx). Wiring in
// the schema as originally written would have rejected every legitimate
// admin status update. Values below are corrected to match the model.
export const createTicketSchema = Joi.object({
  subject: trimmedString.min(2).max(200).required(),
  description: trimmedString.min(2).max(5000).required(),
  priority: trimmedString.valid("low", "medium", "high").optional(),
  userType: trimmedString
    .valid("Customer", "Seller", "Delivery", "User", "Rider", "Admin")
    .optional(),
  mediaUrl: trimmedString.uri().max(2048).allow("", null).optional(),
  mediaType: trimmedString.max(40).allow("", null).optional(),
  mimeType: trimmedString.max(120).allow("", null).optional(),
});

export const addTicketMessageSchema = Joi.object({
  text: trimmedString.max(5000).allow("", null).optional(),
  mediaUrl: trimmedString.uri().max(2048).allow("", null).optional(),
  mediaType: trimmedString.max(40).allow("", null).optional(),
  mimeType: trimmedString.max(120).allow("", null).optional(),
}).or("text", "mediaUrl");

export const updateTicketStatusSchema = Joi.object({
  status: trimmedString.valid("open", "processing", "closed").required(),
});
