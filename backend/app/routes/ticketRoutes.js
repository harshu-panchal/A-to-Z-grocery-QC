import express from "express";
import {
    createTicket,
    getMyTickets,
    getAllTickets,
    replyToTicket,
    updateTicketStatus
} from "../controller/ticketController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import {
    createTicketSchema,
    addTicketMessageSchema,
    updateTicketStatusSchema,
} from "../validation/ticketValidation.js";

const router = express.Router();

// Mixed/Shared routes (Need login)
router.post("/create", verifyToken, validate(createTicketSchema), createTicket);
router.get("/my-tickets", verifyToken, getMyTickets);
router.post("/reply/:id", verifyToken, validate(addTicketMessageSchema), replyToTicket);

// Admin only routes
router.get("/admin/all", verifyToken, allowRoles("admin"), getAllTickets);
router.patch(
    "/admin/status/:id",
    verifyToken,
    allowRoles("admin"),
    validate(updateTicketStatusSchema),
    updateTicketStatus,
);

export default router;
