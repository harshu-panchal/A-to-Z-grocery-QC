import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// Regression test for audit finding H5: changing/resetting an admin or
// seller password did not invalidate previously-issued JWTs, so a leaked
// token remained valid for the rest of its 7-day lifetime even after the
// account owner "secured" their account by changing the password.

process.env.JWT_SECRET = "test-secret-for-token-version";

const mockAdminFindById = jest.fn();
const mockSellerFindById = jest.fn();

jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: { findById: mockAdminFindById },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findById: mockSellerFindById },
}));

const { verifyToken } = await import("../app/middleware/authMiddleware.js");

function makeReqRes(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
}

function selectLean(value) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

describe("verifyToken tokenVersion check (audit H5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects an admin token whose tokenVersion no longer matches the DB (post password-change)", async () => {
    const token = jwt.sign(
      { id: "admin-1", role: "admin", tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    // Admin changed their password after this token was issued -> DB is now version 1.
    mockAdminFindById.mockReturnValue(selectLean({ tokenVersion: 1 }));

    const { req, res, next } = makeReqRes(token);
    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts an admin token whose tokenVersion still matches the DB", async () => {
    const token = jwt.sign(
      { id: "admin-1", role: "admin", tokenVersion: 1 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    mockAdminFindById.mockReturnValue(selectLean({ tokenVersion: 1 }));

    const { req, res, next } = makeReqRes(token);
    await verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user.id).toBe("admin-1");
  });

  it("rejects a seller token whose tokenVersion no longer matches the DB (post password-reset)", async () => {
    const token = jwt.sign(
      { id: "seller-1", role: "seller", tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    mockSellerFindById.mockReturnValue(selectLean({ tokenVersion: 1 }));

    const { req, res, next } = makeReqRes(token);
    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects an admin token for an account that no longer exists", async () => {
    const token = jwt.sign(
      { id: "deleted-admin", role: "admin", tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    mockAdminFindById.mockReturnValue(selectLean(null));

    const { req, res, next } = makeReqRes(token);
    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("does not touch the DB for customer/delivery tokens (no password-based auth to protect)", async () => {
    const token = jwt.sign(
      { id: "customer-1", role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const { req, res, next } = makeReqRes(token);
    await verifyToken(req, res, next);

    expect(mockAdminFindById).not.toHaveBeenCalled();
    expect(mockSellerFindById).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("treats a pre-rollout token with no tokenVersion claim as version 0, matching a never-changed account", async () => {
    // Simulates a token issued before this fix shipped (no tokenVersion in
    // the JWT payload at all) against an account that has never had its
    // password changed (DB tokenVersion defaults to 0).
    const token = jwt.sign(
      { id: "admin-1", role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    mockAdminFindById.mockReturnValue(selectLean({ tokenVersion: 0 }));

    const { req, res, next } = makeReqRes(token);
    await verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
