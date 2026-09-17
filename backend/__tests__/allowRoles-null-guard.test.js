import { jest } from "@jest/globals";

// Regression test for audit finding M4: `allowRoles` threw an unhandled
// TypeError ("Cannot read properties of undefined") instead of a clean 401
// if it was ever wired onto a route without `verifyToken` running first
// (req.user undefined).

jest.unstable_mockModule("../app/models/admin.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));

const { allowRoles } = await import("../app/middleware/authMiddleware.js");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("allowRoles null-guard (audit M4)", () => {
  it("returns a clean 401 instead of throwing when req.user is undefined", () => {
    const middleware = allowRoles("admin");
    const req = {};
    const res = makeRes();
    const next = jest.fn();

    expect(() => middleware(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("still returns 403 for an authenticated user with the wrong role", () => {
    const middleware = allowRoles("admin");
    const req = { user: { id: "u1", role: "customer" } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for an authenticated user with an allowed role", () => {
    const middleware = allowRoles("admin", "seller");
    const req = { user: { id: "u1", role: "seller" } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
