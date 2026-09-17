import React, { useRef, useState, useEffect, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import PageHeader from '@shared/components/ui/PageHeader';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import {
    HiOutlineChatBubbleLeftRight,
    HiOutlineMagnifyingGlass,
    HiOutlineUser,
    HiOutlineBuildingStorefront,
    HiOutlineTruck,
    HiOutlinePaperAirplane,
    HiOutlineEllipsisVertical,
    HiOutlineCheckCircle,
    HiOutlineArrowLeft,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@shared/components/ui/Toast';
import { useAuth } from '@core/context/AuthContext';
import { joinTicketRoom, leaveTicketRoom, onTicketCreated, onTicketMessage } from '@/core/services/orderSocket';
import { useSupportUnread } from '@core/context/SupportUnreadContext';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const TICKETS_QUERY_ROOT = ['admin', 'tickets'];

function mapTicket(t) {
    return {
        ...t,
        id: t._id,
        ticketCode: t._id.slice(-6).toUpperCase(),
        user: t.userId?.name || "Unknown",
        date: new Date(t.createdAt).toLocaleString(),
        messages: (t.messages || []).map((m, i) => ({
            ...m,
            id: m._id || m.id || `msg-${t._id}-${i}`,
            time: new Date(m.createdAt || Date.now()).toLocaleTimeString()
        }))
    };
}

const SupportTickets = () => {
    const { showToast } = useToast();
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const { unreadByTicket, setIsViewingSupportChat, setActiveTicketId, markTicketRead } = useSupportUnread();
    const getToken = () => token;
    const ticketsRef = useRef([]);
    const selectedTicketRoomRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const prevTicketIdRef = useRef(null);
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [reply, setReply] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const queryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        return params;
    }, [page, pageSize, debouncedSearchTerm]);
    const queryKey = [...TICKETS_QUERY_ROOT, queryParams];

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce and
    // page-reset-on-filter-change behavior as before. The socket-driven
    // live message/ticket updates below now write through
    // `queryClient.setQueryData` on this same key instead of a page-local
    // `setTickets`, so a fetched page keeps receiving live updates exactly
    // as before, just from the shared cache instead of local state.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [pageSize]);

    const { data: queryData, isFetching: loading, isError, refetch } = useQuery({
        queryKey,
        queryFn: async () => {
            const res = await adminApi.getTickets(queryParams);
            if (!res.data.success) throw new Error('Failed to load tickets');
            const payload = res.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
            const mapped = data.map(mapTicket);
            return {
                items: mapped,
                total: typeof payload.total === 'number' ? payload.total : mapped.length,
                page: typeof payload.page === 'number' ? payload.page : queryParams.page,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) {
            console.error("Fetch Tickets Error");
            showToast("Failed to load tickets", "error");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const tickets = queryData?.items ?? [];
    const total = queryData?.total ?? 0;

    const setTickets = (updater) => {
        queryClient.setQueryData(queryKey, (old) => {
            if (!old) return old;
            const nextItems = typeof updater === 'function' ? updater(old.items) : updater;
            return { ...old, items: nextItems };
        });
    };

    useEffect(() => {
        setIsViewingSupportChat(true);
        return () => {
            setIsViewingSupportChat(false);
            setActiveTicketId('');
        };
    }, [setIsViewingSupportChat, setActiveTicketId]);

    useEffect(() => {
        const tid = selectedTicket?.id ? String(selectedTicket.id) : "";
        setActiveTicketId(tid);
        if (tid) markTicketRead(tid);
    }, [selectedTicket?.id, setActiveTicketId, markTicketRead]);

    useEffect(() => {
        ticketsRef.current = tickets;
    }, [tickets]);

    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el || !selectedTicket) return;

        const ticketChanged = prevTicketIdRef.current !== selectedTicket.id;
        const shouldScroll = ticketChanged || stickToBottomRef.current;
        prevTicketIdRef.current = selectedTicket.id;
        if (!shouldScroll) return;

        requestAnimationFrame(() => {
            el.scrollTo({
                top: el.scrollHeight,
                behavior: ticketChanged ? 'auto' : 'smooth',
            });
        });
    }, [selectedTicket?.id, selectedTicket?.messages?.length]);

    useEffect(() => {
        setMenuOpen(false);
    }, [selectedTicket?.id]);

    useEffect(() => {
        if (!menuOpen) return;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };

        const onPointerDown = (e) => {
            const target = e.target;
            if (!target) return;
            if (menuRef.current?.contains(target)) return;
            if (menuButtonRef.current?.contains(target)) return;
            setMenuOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [menuOpen]);

    useEffect(() => {
        if (!token) return;

        const offCreated = onTicketCreated(getToken, () => {
            showToast('New support ticket received', 'info');
            // Matches the original's `fetchTicketsRef.current?.(1)` — jump
            // back to page 1 and force a fresh fetch there (setPage alone
            // wouldn't refetch if already on page 1).
            setPage(1);
            queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_ROOT });
        });

        const offMessage = onTicketMessage(getToken, (payload) => {
            const tid = String(payload?.ticketId || '').trim();
            if (!tid) return;

            const message = payload?.message || {};
            const time = new Date(message.createdAt || Date.now()).toLocaleTimeString();
            const normalized = {
                ...message,
                id: message._id || message.id || `msg-${tid}-${Date.now()}`,
                time,
            };

            // Best-effort system notification (in addition to FCM push) for incoming customer messages.
            // Helps when browser push tokens are not registered or when testing in the same browser session.
            const shouldNotify =
                normalized?.isAdmin === false &&
                (document.hidden || String(selectedTicketRoomRef.current || '') !== tid);

            if (shouldNotify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const ticket = (ticketsRef.current || []).find((t) => String(t.id) === tid);
                const userLabel = ticket?.user ? String(ticket.user) : 'Customer';
                const body = String(normalized.text || 'New message').trim() || 'New message';
                const link = `/admin/support-tickets?ticketId=${encodeURIComponent(tid)}`;

                navigator.serviceWorker?.ready
                    .then((reg) => reg?.showNotification?.(`Support message from ${userLabel}`, {
                        body,
                        tag: `ticket-${tid}`,
                        data: { link },
                    }))
                    .catch(() => {
                        // Ignore; fallback to normal in-app UI.
                    });
            }

            setTickets((prev) => prev.map((t) => {
                if (String(t.id) !== tid) return t;
                const existing = Array.isArray(t.messages) ? t.messages : [];
                const last = existing[existing.length - 1];
                if (last && last.text === normalized.text && last.senderType === normalized.senderType && last.createdAt === normalized.createdAt) {
                    return t;
                }
                return { ...t, messages: [...existing, normalized] };
            }));

            setSelectedTicket((prev) => {
                if (!prev || String(prev.id) !== tid) return prev;
                const existing = Array.isArray(prev.messages) ? prev.messages : [];
                const last = existing[existing.length - 1];
                if (last && last.text === normalized.text && last.senderType === normalized.senderType && last.createdAt === normalized.createdAt) {
                    return prev;
                }
                return { ...prev, messages: [...existing, normalized] };
            });
        });

        return () => {
            offCreated?.();
            offMessage?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        if (!token) return;
        const nextId = selectedTicket?.id ? String(selectedTicket.id) : null;
        const prevId = selectedTicketRoomRef.current;

        if (prevId && prevId !== nextId) {
            leaveTicketRoom(prevId, getToken);
        }
        if (nextId && prevId !== nextId) {
            joinTicketRoom(nextId, getToken);
        }
        selectedTicketRoomRef.current = nextId;

        return () => {
            const current = selectedTicketRoomRef.current;
            if (current) leaveTicketRoom(current, getToken);
            selectedTicketRoomRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, selectedTicket?.id]);

    const copyToClipboard = async (text) => {
        const value = String(text || '').trim();
        if (!value) return;

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                showToast('Copied to clipboard', 'success');
                return;
            }
        } catch {
            // Fall back below.
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Copied to clipboard', 'success');
        } catch {
            showToast('Copy failed', 'error');
        }
    };

    const handleSetStatus = async (id, status) => {
        try {
            const res = await adminApi.updateTicketStatus(id, status);
            if (res.data.success) {
                setTickets((prev) => prev.map(t => t.id === id ? { ...t, status } : t));
                setSelectedTicket((prev) => prev?.id === id ? { ...prev, status } : prev);
                showToast(`Ticket status updated: ${status}`, 'success');
            }
        } catch (error) {
            showToast("Failed to update status", "error");
        } finally {
            setMenuOpen(false);
        }
    };

    const handleSendReply = async () => {
        if (!reply.trim() || !selectedTicket) return;

        try {
            const res = await adminApi.replyTicket(selectedTicket.id, reply);
            if (res.data.success) {
                const updatedTicketData = res.data.result;
                const newMessage = {
                    ...updatedTicketData.messages[updatedTicketData.messages.length - 1],
                    time: "Just now"
                };

                const updatedTickets = tickets.map(t => {
                    if (t.id === selectedTicket.id) {
                        return {
                            ...t,
                            messages: [...t.messages, newMessage],
                            status: 'processing'
                        };
                    }
                    return t;
                });

                setTickets(updatedTickets);
                setSelectedTicket({
                    ...selectedTicket,
                    messages: [...selectedTicket.messages, newMessage],
                    status: 'processing'
                });
                setReply('');
                showToast('Reply sent successfully', 'success');
            }
        } catch (error) {
            showToast("Failed to send reply", "error");
        }
    };

    const handleResolve = async (id) => {
        const newStatus = selectedTicket?.status === 'closed' ? 'open' : 'closed';
        return handleSetStatus(id, newStatus);
    };

    const filteredTickets = tickets.filter(t =>
        t.id.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex h-[calc(100vh-140px)] flex-col gap-4">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        <HiOutlineChatBubbleLeftRight className="h-5 w-5 text-primary" />
                        Support Desk
                    </span>
                }
                description="Resolve disputes and respond to customer, seller, and rider tickets in real time."
                actions={<Badge variant="info">{tickets.length} Active</Badge>}
                className="mb-0 shrink-0"
            />

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                {/* Sidebar: Ticket List */}
                <div className={`${selectedTicket ? "hidden" : "flex"} h-full flex-col gap-4 lg:flex lg:w-[380px]`}>
                    <Card
                        className="flex flex-1 flex-col overflow-hidden"
                        contentClassName="flex flex-1 min-h-0 flex-col p-0"
                    >
                        <div className="border-b border-slate-100 p-4">
                            <div className="relative">
                                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by ID or Name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-xs font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
                            {filteredTickets.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedTicket(t)}
                                    className={cn(
                                        "group relative w-full overflow-hidden rounded-xl border p-3.5 pr-9 text-left transition-all",
                                        selectedTicket?.id === t.id
                                            ? "border-primary bg-primary text-white shadow-sm"
                                            : "border-slate-100 bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                                    )}
                                >
                                    {Number(unreadByTicket?.[t.id] || 0) > 0 && (
                                        <span
                                            className={cn(
                                                "absolute top-3 right-3 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black text-white shadow-sm",
                                                "bg-danger"
                                            )}
                                            aria-label={`Unread messages: ${unreadByTicket?.[t.id]}`}
                                        >
                                            {Number(unreadByTicket?.[t.id] || 0) > 99 ? "99+" : String(unreadByTicket?.[t.id])}
                                        </span>
                                    )}
                                    <div className="mb-2 flex items-start justify-between">
                                        <Badge
                                            variant={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'secondary'}
                                            className={cn(selectedTicket?.id === t.id && "border-white/30 bg-white/20 text-white")}
                                        >
                                            {t.priority}
                                        </Badge>
                                        <span className={cn("text-[9px] font-bold", selectedTicket?.id === t.id ? "text-white/70" : "text-slate-400")}>{t.date}</span>
                                    </div>
                                    <h4 className="mb-1 truncate text-xs font-black">{t.subject}</h4>
                                    <div className="flex items-center gap-2">
                                        <div className={cn("rounded-md p-1", selectedTicket?.id === t.id ? "bg-white/15" : "bg-slate-100")}>
                                            {t.userType === 'Customer' && <HiOutlineUser className="h-3 w-3" />}
                                            {t.userType === 'Seller' && <HiOutlineBuildingStorefront className="h-3 w-3" />}
                                            {t.userType === 'Rider' && <HiOutlineTruck className="h-3 w-3" />}
                                        </div>
                                        <span className={cn("text-[10px] font-bold", selectedTicket?.id === t.id ? "text-white/80" : "text-slate-500")}>
                                            {t.user} • {t.userType}
                                        </span>
                                    </div>
                                </button>
                            ))}
                            {!loading && filteredTickets.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <HiOutlineChatBubbleLeftRight className="mb-2 h-8 w-8 text-slate-200" />
                                    <p className="text-xs font-semibold text-slate-400">No tickets found</p>
                                </div>
                            )}
                        </div>
                        <div className="border-t border-slate-100 p-3">
                            <Pagination
                                page={queryData?.page ?? page}
                                totalPages={Math.ceil(total / pageSize) || 1}
                                total={total}
                                pageSize={pageSize}
                                onPageChange={(p) => setPage(p)}
                                onPageSizeChange={(newSize) => {
                                    setPageSize(newSize);
                                    setPage(1);
                                }}
                                loading={loading}
                                compact
                            />
                        </div>
                    </Card>
                </div>

                {/* Main Chat Area */}
                <div
                    className={`${selectedTicket ? "fixed inset-0 z-40 flex bg-white" : "hidden"} h-full min-h-0 flex-1 flex-col lg:static lg:inset-auto lg:z-auto lg:flex lg:bg-transparent`}
                >
                    {selectedTicket ? (
                        <Card
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                            contentClassName="flex flex-1 min-h-0 flex-col p-0"
                        >
                            {/* Chat Header */}
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 p-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <button
                                        onClick={() => setSelectedTicket(null)}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-800 lg:hidden"
                                        title="Back to tickets"
                                    >
                                        <HiOutlineArrowLeft className="h-4.5 w-4.5" />
                                    </button>
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <HiOutlineChatBubbleLeftRight className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="truncate text-sm font-black leading-none text-slate-900">{selectedTicket.subject}</h3>
                                        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest leading-none text-slate-400">
                                            Ticket ID: {selectedTicket.ticketCode} • User: {selectedTicket.user} • Status: {selectedTicket.status}
                                        </p>
                                    </div>
                                </div>
                                <div className="relative flex shrink-0 items-center gap-2">
                                    <button
                                        onClick={() => handleResolve(selectedTicket.id)}
                                        className={cn(
                                            "rounded-lg border p-2.5 transition-all",
                                            selectedTicket.status === 'closed' ? "border-success/20 bg-success/10 text-success" : "border-slate-200 bg-white text-slate-400 hover:text-success"
                                        )}
                                        title={selectedTicket.status === 'closed' ? "Reopen Ticket" : "Mark as Resolved"}
                                    >
                                        <HiOutlineCheckCircle className="h-5 w-5" />
                                    </button>
                                    <button
                                        ref={menuButtonRef}
                                        onClick={() => setMenuOpen(v => !v)}
                                        className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-400 transition-all hover:text-slate-600"
                                        aria-haspopup="menu"
                                        aria-expanded={menuOpen ? "true" : "false"}
                                        title="More actions"
                                    >
                                        <HiOutlineEllipsisVertical className="h-5 w-5" />
                                    </button>

                                    <AnimatePresence>
                                        {menuOpen ? (
                                            <motion.div
                                                ref={menuRef}
                                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                                transition={{ duration: 0.12 }}
                                                className="absolute right-0 top-[52px] z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                                                role="menu"
                                            >
                                                <button
                                                    onClick={() => copyToClipboard(selectedTicket.id)}
                                                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                                    role="menuitem"
                                                >
                                                    Copy ticket ID
                                                </button>
                                                <button
                                                    onClick={() => copyToClipboard(selectedTicket.user)}
                                                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                                    role="menuitem"
                                                >
                                                    Copy user name
                                                </button>
                                                <div className="h-px bg-slate-100" />
                                                <button
                                                    onClick={() => handleSetStatus(selectedTicket.id, 'open')}
                                                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                                    role="menuitem"
                                                >
                                                    Mark as open
                                                </button>
                                                <button
                                                    onClick={() => handleSetStatus(selectedTicket.id, 'processing')}
                                                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                                    role="menuitem"
                                                >
                                                    Mark as processing
                                                </button>
                                                <button
                                                    onClick={() => handleSetStatus(selectedTicket.id, 'closed')}
                                                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                                    role="menuitem"
                                                >
                                                    Mark as closed
                                                </button>
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Messages Thread + Fixed Reply */}
                            <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-50/30">
                                <div
                                    ref={messagesContainerRef}
                                    onScroll={(e) => {
                                        const el = e.currentTarget;
                                        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                                        stickToBottomRef.current = distanceFromBottom < 80;
                                    }}
                                    className="custom-scrollbar h-full touch-pan-y space-y-5 overflow-y-auto overscroll-contain p-4 pb-36"
                                    tabIndex={0}
                                    aria-label="Support chat messages"
                                    data-lenis-prevent
                                >
                                    {selectedTicket.messages.map((m) => (
                                        <div key={m.id} className={cn("flex flex-col", m.isAdmin ? "items-end" : "items-start")}>
                                            <div className={cn(
                                                "max-w-[80%] rounded-xl p-3.5 text-sm font-medium leading-relaxed shadow-sm",
                                                m.isAdmin ? "rounded-tr-sm bg-slate-900 text-white" : "rounded-tl-sm border border-slate-200 bg-white text-slate-700"
                                            )}>
                                                {m.mediaUrl ? (
                                                    <img
                                                        src={m.mediaUrl}
                                                        alt="Attachment"
                                                        loading="lazy"
                                                        className="w-full max-w-[260px] rounded-lg border border-black/10"
                                                    />
                                                ) : null}
                                                {m.text ? <div className={m.mediaUrl ? "mt-2" : ""}>{m.text}</div> : null}
                                            </div>
                                            <span className="mt-1.5 px-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{m.time}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white p-4">
                                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 transition-all focus-within:border-primary focus-within:bg-white">
                                        <textarea
                                            value={reply}
                                            onChange={(e) => setReply(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendReply();
                                                }
                                            }}
                                            placeholder="Type your response here..."
                                            className="min-h-[40px] max-h-[120px] flex-1 resize-none border-none bg-transparent p-2 text-sm font-semibold outline-none"
                                        />
                                        <button
                                            onClick={handleSendReply}
                                            disabled={!reply.trim()}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                        >
                                            <HiOutlinePaperAirplane className="-mt-0.5 ml-0.5 h-4.5 w-4.5 -rotate-45" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center">
                            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm">
                                <HiOutlineChatBubbleLeftRight className="h-9 w-9 text-slate-200" />
                            </div>
                            <h4 className="text-lg font-black text-slate-900">Universal Support Hub</h4>
                            <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-slate-400">
                                Select a transaction or dispute ticket from the sidebar to begin resolution.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SupportTickets;
