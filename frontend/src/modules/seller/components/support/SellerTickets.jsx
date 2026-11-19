import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, MessageCircle, Plus, Send } from "lucide-react";
import { sellerApi } from "../../services/sellerApi";
import { useToast } from "@shared/components/ui/Toast";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";
import {
  joinTicketRoom,
  leaveTicketRoom,
  onTicketMessage,
  onTicketStatus,
} from "@/core/services/orderSocket";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "payout", label: "Payout" },
  { value: "order", label: "Order" },
  { value: "product", label: "Product / Catalog" },
  { value: "kyc", label: "Account / KYC" },
  { value: "general", label: "Other" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const STATUS_STYLE = {
  open: "bg-amber-50 text-amber-700",
  processing: "bg-sky-50 text-sky-700",
  closed: "bg-slate-100 text-slate-500",
};
const STATUS_LABEL = { open: "Open", processing: "In progress", closed: "Resolved" };

const EMPTY_FORM = { category: "payout", orderId: "", subject: "", description: "", priority: "medium" };

const shortId = (id) => String(id || "").slice(-6).toUpperCase();
const fmtTime = (v) => (v ? new Date(v).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "");

function StatusPill({ status }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold", STATUS_STYLE[status] || STATUS_STYLE.open)}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

const SellerTickets = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const getToken = useMemo(() => createSocketTokenReader(STORAGE_KEYS.AUTH_SELLER), []);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | new | chat
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const active = tickets.find((t) => String(t._id) === String(activeId)) || null;

  const load = async () => {
    try {
      const res = await sellerApi.getMyTickets();
      const list = res?.data?.result;
      setTickets(Array.isArray(list) ? list : []);
    } catch {
      showToast("Failed to load your tickets", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open a ticket straight from a notification link (?ticketId=…).
  useEffect(() => {
    const tid = searchParams.get("ticketId");
    if (tid && tickets.some((t) => String(t._id) === tid)) {
      setActiveId(tid);
      setView("chat");
    }
  }, [searchParams, tickets]);

  // Live messages / status for the open ticket.
  useEffect(() => {
    if (!activeId) return undefined;
    joinTicketRoom(activeId, getToken);
    const offMsg = onTicketMessage(getToken, (payload) => {
      const tid = String(payload?.ticketId || "");
      const msg = payload?.message;
      if (!msg) return;
      setTickets((prev) =>
        prev.map((t) => {
          if (String(t._id) !== tid) return t;
          const msgs = t.messages || [];
          if (msg._id && msgs.some((m) => String(m._id) === String(msg._id))) return t;
          return { ...t, messages: [...msgs, msg] };
        }),
      );
    });
    const offStatus = onTicketStatus(getToken, (payload) => {
      const tid = String(payload?.ticketId || "");
      setTickets((prev) => prev.map((t) => (String(t._id) === tid ? { ...t, status: payload.status } : t)));
    });
    return () => {
      leaveTicketRoom(activeId, getToken);
      offMsg();
      offStatus();
    };
  }, [activeId, getToken]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages?.length, view]);

  const openTicket = (id) => {
    setActiveId(id);
    setView("chat");
  };

  const backToList = () => {
    setView("list");
    setActiveId(null);
    if (searchParams.get("ticketId")) {
      searchParams.delete("ticketId");
      setSearchParams(searchParams, { replace: true });
    }
  };

  const submitTicket = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        category: form.category,
        subject: form.subject,
        description: form.description,
        priority: form.priority,
        ...(form.orderId.trim() ? { orderId: form.orderId.trim() } : {}),
      };
      const res = await sellerApi.createTicket(payload);
      const created = res?.data?.result;
      showToast("Ticket raised. Admin will reply here.", "success");
      setForm(EMPTY_FORM);
      if (created?._id) {
        setTickets((prev) => [created, ...prev]);
        openTicket(created._id);
      } else {
        setView("list");
        load();
      }
    } catch (error) {
      const existingId = error.response?.status === 409 && error.response?.data?.result?.ticketId;
      if (existingId) {
        showToast("You already have an open ticket for this order", "info");
        await load();
        openTicket(String(existingId));
        return;
      }
      showToast(error.response?.data?.message || "Failed to raise ticket", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !active || sending) return;
    setSending(true);
    try {
      const res = await sellerApi.replyTicket(active._id, text);
      const updated = res?.data?.result;
      if (updated?._id) {
        setTickets((prev) => prev.map((t) => (String(t._id) === String(updated._id) ? updated : t)));
      }
      setReply("");
    } catch {
      showToast("Failed to send message", "error");
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {view === "list" && (
        <>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Help from Admin</h2>
              <p className="text-xs text-slate-500">Raise a ticket and chat with the admin team</p>
            </div>
            <button
              type="button"
              onClick={() => setView("new")}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white hover:opacity-90"
            >
              <Plus size={14} /> New ticket
            </button>
          </div>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="animate-spin text-slate-400" size={22} />
            </div>
          ) : tickets.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              <MessageCircle className="mx-auto mb-2 text-slate-300" size={26} />
              No tickets yet. Payout, order or account problem? Raise a ticket.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => openTicket(t._id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{t.subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      #{shortId(t._id)} · {CATEGORY_LABEL[t.category] || "Other"}
                      {t.orderId ? ` · Order #${t.orderId}` : ""} · {fmtTime(t.updatedAt || t.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={t.status} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === "new" && (
        <form onSubmit={submitTicket} className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setView("list")} className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100">
              <ArrowLeft size={18} className="text-slate-600" />
            </button>
            <h2 className="text-base font-semibold text-slate-800">Raise a ticket</h2>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">Topic</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm({ ...form, category: c.value })}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs font-bold",
                    form.category === c.value
                      ? "border-primary bg-primary text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">Order ID (optional)</span>
            <input
              className={inputCls}
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              placeholder="e.g. ORD123456 — only if this is about one order"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">Subject</span>
            <input
              required
              minLength={2}
              maxLength={200}
              className={inputCls}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Short summary of the problem"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">Details</span>
            <textarea
              required
              minLength={2}
              maxLength={5000}
              className={cn(inputCls, "min-h-[120px]")}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Explain what happened, amounts, dates…"
            />
          </label>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">Priority</p>
            <div className="grid grid-cols-3 gap-2">
              {["low", "medium", "high"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p })}
                  className={cn(
                    "rounded-xl border py-2 text-xs font-bold capitalize",
                    form.priority === p ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-600",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit ticket
          </button>
        </form>
      )}

      {view === "chat" && active && (
        <div className="flex flex-col h-[70vh] min-h-[420px]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <button type="button" onClick={backToList} className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100">
              <ArrowLeft size={18} className="text-slate-600" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{active.subject}</p>
              <p className="text-xs text-slate-500">
                #{shortId(active._id)} · {CATEGORY_LABEL[active.category] || "Other"}
                {active.orderId ? ` · Order #${active.orderId}` : ""}
              </p>
            </div>
            <StatusPill status={active.status} />
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3">
            {(active.messages || []).map((m, i) => (
              <div key={m._id || i} className={cn("flex flex-col", m.isAdmin ? "items-start" : "items-end")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                    m.isAdmin
                      ? "rounded-tl-sm border border-slate-200 bg-white text-slate-700"
                      : "rounded-tr-sm bg-primary text-white",
                  )}
                >
                  {m.mediaUrl ? <img src={m.mediaUrl} alt="Attachment" className="mb-1.5 max-w-[220px] rounded-lg" /> : null}
                  {m.text}
                </div>
                <span className="mt-1 px-1 text-[10px] text-slate-400">
                  {m.isAdmin ? "Admin · " : ""}
                  {fmtTime(m.createdAt)}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {active.status === "closed" && (
            <p className="px-4 pt-2 text-[11px] text-slate-500 bg-white">
              This ticket is resolved. Sending a message will reopen it.
            </p>
          )}
          <div className="flex items-end gap-2 border-t border-slate-100 bg-white p-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              rows={1}
              placeholder="Type a message…"
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-primary max-h-28"
            />
            <button
              type="button"
              onClick={sendReply}
              disabled={!reply.trim() || sending}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-50"
              aria-label="Send"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerTickets;
