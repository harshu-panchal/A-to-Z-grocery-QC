import { jest } from "@jest/globals";

// Regression test for audit finding H1: replyToTicket had no ownership
// check (any authenticated user could reply to any ticket by guessing its
// id) and trusted `req.body.isAdmin` from the client to decide whether the
// reply was rendered as a support-staff message.

const mockTicketFindById = jest.fn();
const mockAdminFind = jest.fn();
const mockEmitTicketMessage = jest.fn();
const mockEmitNotificationEvent = jest.fn();

jest.unstable_mockModule("../app/models/ticket.js", () => ({
  default: { findById: mockTicketFindById },
}));

jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: { find: mockAdminFind },
}));

jest.unstable_mockModule("../app/services/ticketSocketEmitter.js", () => ({
  emitTicketCreated: jest.fn(),
  emitTicketMessage: mockEmitTicketMessage,
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

jest.unstable_mockModule("../app/modules/notifications/notification.constants.js", () => ({
  NOTIFICATION_EVENTS: { SUPPORT_TICKET_MESSAGE: "SUPPORT_TICKET_MESSAGE" },
}));

const { replyToTicket } = await import("../app/controller/ticketController.js");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeTicketDoc(overrides = {}) {
  const messages = [];
  return {
    _id: "ticket-1",
    userId: "owner-user",
    subject: "Help",
    status: "open",
    messages,
    save: jest.fn().mockImplementation(function save() {
      return Promise.resolve(this);
    }),
    ...overrides,
  };
}

describe("replyToTicket access control (audit H1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
  });

  it("blocks a non-owner, non-admin user from replying to someone else's ticket", async () => {
    const ticket = makeTicketDoc({ userId: "owner-user" });
    mockTicketFindById.mockResolvedValue(ticket);

    const req = {
      params: { id: "ticket-1" },
      body: { text: "I am reading your private ticket" },
      user: { id: "attacker-user", role: "customer", name: "Attacker" },
    };
    const res = makeRes();

    await replyToTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(ticket.messages).toHaveLength(0);
    expect(ticket.save).not.toHaveBeenCalled();
  });

  it("allows the ticket owner to reply to their own ticket", async () => {
    const ticket = makeTicketDoc({ userId: "owner-user" });
    mockTicketFindById.mockResolvedValue(ticket);

    const req = {
      params: { id: "ticket-1" },
      body: { text: "Following up on my issue" },
      user: { id: "owner-user", role: "customer", name: "Owner" },
    };
    const res = makeRes();

    await replyToTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0].isAdmin).toBe(false);
    expect(ticket.messages[0].senderType).toBe("User");
  });

  it("ignores a client-supplied isAdmin:true and derives it from the verified role instead", async () => {
    const ticket = makeTicketDoc({ userId: "owner-user" });
    mockTicketFindById.mockResolvedValue(ticket);

    const req = {
      params: { id: "ticket-1" },
      // Attacker-controlled body claims admin — must be ignored.
      body: { text: "Pretending to be support", isAdmin: true },
      user: { id: "owner-user", role: "customer", name: "Owner" },
    };
    const res = makeRes();

    await replyToTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ticket.messages[0].isAdmin).toBe(false);
    expect(ticket.messages[0].sender).not.toBe("Admin");
    expect(ticket.status).not.toBe("processing");
  });

  it("lets a real admin reply to any ticket and correctly marks the message as admin", async () => {
    const ticket = makeTicketDoc({ userId: "owner-user" });
    mockTicketFindById.mockResolvedValue(ticket);

    const req = {
      params: { id: "ticket-1" },
      body: { text: "Support here, looking into it" },
      user: { id: "admin-1", role: "admin", name: "Support Agent" },
    };
    const res = makeRes();

    await replyToTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ticket.messages[0].isAdmin).toBe(true);
    expect(ticket.messages[0].sender).toBe("Admin");
    expect(ticket.status).toBe("processing");
  });
});
