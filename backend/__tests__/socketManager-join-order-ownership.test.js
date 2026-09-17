import { jest } from "@jest/globals";

// Regression test for audit finding M1: `join_order` joined `order:${id}`
// for any string with no ownership check — any connected socket (even one
// belonging to a different customer) could receive live status updates
// for an order that wasn't theirs just by knowing/guessing its id.

const mockOrderFindOne = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne },
}));

jest.unstable_mockModule("../app/models/ticket.js", () => ({
  default: { findById: jest.fn() },
}));

jest.unstable_mockModule("../app/socket/socketAuth.js", () => ({
  verifySocketToken: jest.fn(),
}));

const { initSocket } = await import("../app/socket/socketManager.js");

function selectLean(value) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function buildConnection(user) {
  const handlers = {};
  const fakeIo = {
    use: () => {},
    on: (event, fn) => {
      if (event === "connection") handlers.connection = fn;
    },
  };
  initSocket(fakeIo);

  const socketHandlers = {};
  const socket = {
    id: "socket-1",
    user,
    join: jest.fn(),
    leave: jest.fn(),
    on: (event, fn) => {
      socketHandlers[event] = fn;
    },
  };
  handlers.connection(socket);
  return { socket, socketHandlers };
}

describe("socketManager join_order ownership (audit M1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not let a customer join another customer's order room", async () => {
    mockOrderFindOne.mockReturnValue(
      selectLean({ customer: "owner-user", seller: "seller-1", deliveryBoy: null, deliveryPartner: null }),
    );
    const { socket, socketHandlers } = buildConnection({ id: "attacker-user", role: "customer" });

    await socketHandlers.join_order("ORD-1");

    expect(socket.join).not.toHaveBeenCalledWith("order:ORD-1");
  });

  it("lets the owning customer join their own order room", async () => {
    mockOrderFindOne.mockReturnValue(
      selectLean({ customer: "owner-user", seller: "seller-1", deliveryBoy: null, deliveryPartner: null }),
    );
    const { socket, socketHandlers } = buildConnection({ id: "owner-user", role: "customer" });

    await socketHandlers.join_order("ORD-1");

    expect(socket.join).toHaveBeenCalledWith("order:ORD-1");
  });

  it("lets the assigned delivery partner join the order room", async () => {
    mockOrderFindOne.mockReturnValue(
      selectLean({ customer: "owner-user", seller: "seller-1", deliveryBoy: "rider-1", deliveryPartner: null }),
    );
    const { socket, socketHandlers } = buildConnection({ id: "rider-1", role: "delivery" });

    await socketHandlers.join_order("ORD-1");

    expect(socket.join).toHaveBeenCalledWith("order:ORD-1");
  });

  it("lets an admin join any order room without an ownership lookup", async () => {
    const { socket, socketHandlers } = buildConnection({ id: "admin-1", role: "admin" });

    await socketHandlers.join_order("ORD-1");

    expect(socket.join).toHaveBeenCalledWith("order:ORD-1");
    expect(mockOrderFindOne).not.toHaveBeenCalled();
  });

  it("does nothing when the order does not exist", async () => {
    mockOrderFindOne.mockReturnValue(selectLean(null));
    const { socket, socketHandlers } = buildConnection({ id: "some-user", role: "customer" });

    await socketHandlers.join_order("ORD-does-not-exist");

    expect(socket.join).not.toHaveBeenCalledWith("order:ORD-does-not-exist");
  });
});
