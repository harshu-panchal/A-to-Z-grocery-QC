import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { validate } from "../app/middleware/validate.js";
import {
  createTicketSchema,
  addTicketMessageSchema,
  updateTicketStatusSchema,
} from "../app/validation/ticketValidation.js";
import {
  submitReviewSchema,
  updateReviewStatusSchema,
} from "../app/validation/reviewValidation.js";

// Regression test for audit finding H4: ticket and review endpoints
// accepted user input with no schema validation at any layer. This
// exercises the actual route-level wiring (validate(schema) -> handler),
// not just the schemas in isolation, since the bug was specifically that
// the schemas existed but were never applied to the routes.

function buildApp(schema) {
  const app = express();
  app.use(express.json());
  app.post("/test", validate(schema), (req, res) => {
    res.status(200).json({ ok: true, body: req.body });
  });
  return app;
}

describe("ticket/review validation wiring (audit H4)", () => {
  it("rejects a ticket create payload with an out-of-range priority", async () => {
    const app = buildApp(createTicketSchema);
    const res = await request(app)
      .post("/test")
      .send({ subject: "Help", description: "Something is broken", priority: "urgent" });

    expect(res.status).toBe(400);
  });

  it("accepts a valid ticket create payload", async () => {
    const app = buildApp(createTicketSchema);
    const res = await request(app)
      .post("/test")
      .send({ subject: "Help", description: "Something is broken", priority: "high" });

    expect(res.status).toBe(200);
  });

  it("rejects a ticket reply with neither text nor mediaUrl", async () => {
    const app = buildApp(addTicketMessageSchema);
    const res = await request(app).post("/test").send({});

    expect(res.status).toBe(400);
  });

  it("rejects a ticket status update with a status the model doesn't support", async () => {
    const app = buildApp(updateTicketStatusSchema);
    const res = await request(app).post("/test").send({ status: "resolved" });

    expect(res.status).toBe(400);
  });

  it("accepts the real status values the admin UI actually sends", async () => {
    const app = buildApp(updateTicketStatusSchema);
    for (const status of ["open", "processing", "closed"]) {
      const res = await request(app).post("/test").send({ status });
      expect(res.status).toBe(200);
    }
  });

  it("rejects a review submission with a rating outside 1-5", async () => {
    const app = buildApp(submitReviewSchema);
    const res = await request(app)
      .post("/test")
      .send({ productId: "prod-1", rating: 9001, comment: "Great product" });

    expect(res.status).toBe(400);
  });

  it("rejects a review submission with a non-numeric rating", async () => {
    const app = buildApp(submitReviewSchema);
    const res = await request(app)
      .post("/test")
      .send({ productId: "prod-1", rating: "five stars", comment: "Great product" });

    expect(res.status).toBe(400);
  });

  it("accepts a valid review submission", async () => {
    const app = buildApp(submitReviewSchema);
    const res = await request(app)
      .post("/test")
      .send({ productId: "prod-1", rating: 5, comment: "Great product" });

    expect(res.status).toBe(200);
  });

  it("rejects a review-status update with an arbitrary status string", async () => {
    const app = buildApp(updateReviewStatusSchema);
    const res = await request(app).post("/test").send({ status: "definitely-approved" });

    expect(res.status).toBe(400);
  });
});
