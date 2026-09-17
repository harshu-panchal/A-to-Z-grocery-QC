import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import { useToast } from '@shared/components/ui/Toast';
import {
    HiOutlinePaperAirplane,
    HiOutlineLink,
    HiOutlineUsers,
    HiOutlineBuildingStorefront,
    HiOutlinePhoto,
    HiOutlineDevicePhoneMobile,
    HiOutlineTruck,
    HiOutlineBolt,
    HiOutlineExclamationCircle,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';
import { Smile } from 'lucide-react';
import axiosInstance from '@core/api/axios';
import { adminApi } from '../services/adminApi';

const EMOJIS = [
    '🔥', '🎉', '✅', '⚡', '💥', '💸', '🛍️', '🎁', '🚚', '📦',
    '⏰', '📣', '📌', '🆕', '🛒', '🏷️', '💳', '💰', '📉', '📈',
    '❤️', '💙', '💚', '🧡', '✨', '⭐', '🌟', '🚀', '🎯', '💯',
    '😀', '😄', '😁', '😂', '😉', '😊', '😍', '🤩', '😎', '🤔',
    '🙏', '🤝', '👍', '👎', '👀', '💪', '🎊', '🥳', '🎈', '🎂',
    '🍕', '🍔', '🍟', '🍦', '🍩', '🍫', '🥤', '☕', '🍎', '🥗',
    '🌧️', '☀️', '❄️', '🌙', '🌈', '⚠️', '❗', '❓', '🔔', '🔒',
];

const NotificationComposer = () => {
    const { showToast } = useToast();
    const { settings } = useSettings();
    const appName = (settings?.appName || 'App').toUpperCase();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [selectedSegment, setSelectedSegment] = useState('customers');
    const [deepLink, setDeepLink] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [emojiTarget, setEmojiTarget] = useState('title'); // 'title' | 'message'
    const [emojiPickerPos, setEmojiPickerPos] = useState({ top: 0, left: 0 });

    const titleInputRef = useRef(null);
    const messageInputRef = useRef(null);
    const titleEmojiBtnRef = useRef(null);
    const messageEmojiBtnRef = useRef(null);
    const emojiPopoverRef = useRef(null);
    const imageInputRef = useRef(null);

    // Perf audit Phase 8: migrated audience stats to React Query. Original
    // silently kept the zeroed defaults on failure (no toast), so the
    // queryFn matches that by swallowing the error and returning defaults.
    const { data: audienceStats = { all: 0, customers: 0, sellers: 0, delivery: 0 } } = useQuery({
        queryKey: ['admin', 'broadcastAudienceStats'],
        queryFn: async () => {
            try {
                const res = await adminApi.getBroadcastAudienceStats();
                const result = res?.data?.result || {};
                return {
                    all: Number(result?.all || 0),
                    customers: Number(result?.customers || 0),
                    sellers: Number(result?.sellers || 0),
                    delivery: Number(result?.delivery || 0),
                };
            } catch {
                return { all: 0, customers: 0, sellers: 0, delivery: 0 };
            }
        },
    });

    const segments = [
        { id: 'all', label: 'All Users', count: audienceStats.all, description: 'Universal Reach', icon: HiOutlineUsers, color: 'text-slate-600', bg: 'bg-slate-100' },
        { id: 'customers', label: 'Customers', count: audienceStats.customers, description: 'Customer Audience', icon: HiOutlineUsers, color: 'text-primary', bg: 'bg-primary/10' },
        { id: 'sellers', label: 'Sellers', count: audienceStats.sellers, description: 'Seller Audience', icon: HiOutlineBuildingStorefront, color: 'text-info', bg: 'bg-info/10' },
        { id: 'delivery', label: 'Delivery Partners', count: audienceStats.delivery, description: 'Delivery Audience', icon: HiOutlineTruck, color: 'text-success', bg: 'bg-success/10' },
    ];

    const handleSend = async () => {
        if (isSending) return;
        if (!title || !message) {
            showToast('Please complete the notification broadcast fields', 'warning');
            return;
        }

        try {
            setIsSending(true);
            const targetCount = Number(segments.find((s) => s.id === selectedSegment)?.count || 0);
            showToast(`Broadcasting to ${targetCount.toLocaleString('en-IN')} users...`, 'info');

            let uploadedImageUrl = '';
            if (imageFile) {
                const uploadForm = new FormData();
                uploadForm.append('file', imageFile);
                const uploadRes = await axiosInstance.post('/media/upload', uploadForm, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                uploadedImageUrl =
                    uploadRes.data?.result?.url ||
                    uploadRes.data?.data?.url ||
                    uploadRes.data?.url ||
                    '';
                if (!uploadedImageUrl) {
                    throw new Error('Failed to upload image');
                }
            }

            const broadcastRes = await adminApi.broadcastNotification({
                audience: selectedSegment,
                title,
                message,
                deepLink: deepLink || '',
                imageUrl: uploadedImageUrl || '',
            });

            const result = broadcastRes?.data?.result || {};
            const targetedUsers = Number(result?.targetedUsers || 0);
            const delivered = Number(result?.delivered || 0);
            showToast(
                `Campaign launched: ${delivered} delivered to ${targetedUsers} targeted users`,
                'success'
            );
            setTitle('');
            setMessage('');
            setDeepLink('');
            setImageFile(null);
            setImagePreview('');
        } catch (error) {
            const errorMessage =
                error?.response?.data?.message ||
                error?.message ||
                'Failed to send notification';
            showToast(errorMessage, 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
            showToast('Please select an image file', 'warning');
            if (e.target) e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            setImageFile(file);
            setImagePreview(String(evt?.target?.result || ''));
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected.
        if (e.target) e.target.value = '';
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const closeEmojiPicker = () => setEmojiPickerOpen(false);

    const openEmojiPicker = (target) => {
        const nextTarget = target === 'message' ? 'message' : 'title';
        if (emojiPickerOpen && emojiTarget === nextTarget) {
            closeEmojiPicker();
            return;
        }
        setEmojiTarget(nextTarget);
        setEmojiPickerOpen(true);

        const btn = nextTarget === 'message' ? messageEmojiBtnRef.current : titleEmojiBtnRef.current;
        if (!btn || typeof btn.getBoundingClientRect !== 'function' || typeof window === 'undefined') return;

        const rect = btn.getBoundingClientRect();
        const popoverWidth = 280;
        const padding = 12;
        const left = clamp(rect.right - popoverWidth, padding, window.innerWidth - popoverWidth - padding);
        const top = rect.bottom + 10;
        setEmojiPickerPos({ top, left });
    };

    useEffect(() => {
        if (!emojiPickerOpen) return;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeEmojiPicker();
        };

        const onPointerDown = (e) => {
            const target = e.target;
            if (!target) return;
            if (emojiPopoverRef.current?.contains(target)) return;
            if (titleEmojiBtnRef.current?.contains(target)) return;
            if (messageEmojiBtnRef.current?.contains(target)) return;
            closeEmojiPicker();
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointerdown', onPointerDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerdown', onPointerDown);
        };
    }, [emojiPickerOpen]);

    const insertEmoji = (emoji) => {
        const nextEmoji = String(emoji || '');
        if (!nextEmoji) return;

        const isMessage = emojiTarget === 'message';
        const el = isMessage ? messageInputRef.current : titleInputRef.current;
        const value = isMessage ? message : title;
        const setValue = isMessage ? setMessage : setTitle;

        const start = typeof el?.selectionStart === 'number' ? el.selectionStart : value.length;
        const end = typeof el?.selectionEnd === 'number' ? el.selectionEnd : value.length;
        const next = `${value.slice(0, start)}${nextEmoji}${value.slice(end)}`;

        setValue(next);

        requestAnimationFrame(() => {
            try {
                el?.focus?.();
                const caret = start + nextEmoji.length;
                el?.setSelectionRange?.(caret, caret);
            } catch {
                // ignore
            }
        });
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Growth Signal"
                description="Create and send targeted notifications to keep customers engaged."
                badge={<Badge variant="warning">Push Engine</Badge>}
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Composer Section */}
                <div className="space-y-5 lg:col-span-2">
                    <Card className="p-5">
                        <div className="space-y-5">
                            {/* Card Header */}
                            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                    <HiOutlinePaperAirplane className="h-5 w-5 -rotate-45 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900">Campaign Composer</h3>
                                    <p className="text-xs text-slate-400">Design your notification</p>
                                </div>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-5">
                                {/* Title */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Notification Title</label>
                                        <button
                                            ref={titleEmojiBtnRef}
                                            type="button"
                                            onClick={() => openEmojiPicker('title')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all",
                                                emojiPickerOpen && emojiTarget === 'title'
                                                    ? "border-primary/20 bg-primary/10 text-primary"
                                                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                            )}
                                            aria-label="Add emoji to title"
                                            title="Add emoji"
                                        >
                                            <Smile className="h-3.5 w-3.5" />
                                            Emoji
                                        </button>
                                    </div>
                                    <input
                                        ref={titleInputRef}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        onFocus={() => setEmojiTarget('title')}
                                        placeholder="E.g. Hot Deals are back! 🔥"
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        maxLength={50}
                                    />
                                    <p className="text-right text-[10px] text-slate-400">{title.length}/50</p>
                                </div>

                                {/* Message */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Broadcast Message</label>
                                        <button
                                            ref={messageEmojiBtnRef}
                                            type="button"
                                            onClick={() => openEmojiPicker('message')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all",
                                                emojiPickerOpen && emojiTarget === 'message'
                                                    ? "border-primary/20 bg-primary/10 text-primary"
                                                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                            )}
                                            aria-label="Add emoji to message"
                                            title="Add emoji"
                                        >
                                            <Smile className="h-3.5 w-3.5" />
                                            Emoji
                                        </button>
                                    </div>
                                    <textarea
                                        ref={messageInputRef}
                                        rows={4}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onFocus={() => setEmojiTarget('message')}
                                        placeholder="Enter your push notification body text..."
                                        className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        maxLength={200}
                                    />
                                    <p className="text-right text-[10px] text-slate-400">{message.length}/200</p>
                                </div>

                                {/* Deep Link & Image */}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Deep Link (Optional)</label>
                                        <div className="relative">
                                            <HiOutlineLink className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input
                                                value={deepLink}
                                                onChange={(e) => setDeepLink(e.target.value)}
                                                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                placeholder="e.g. /deals/category"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Image (Optional)</label>
                                        <input
                                            ref={imageInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleImageSelect}
                                        />

                                        <button
                                            type="button"
                                            onClick={() => imageInputRef.current?.click?.()}
                                            className="flex h-10 w-full items-center justify-start gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-left transition-colors hover:bg-slate-50"
                                        >
                                            <HiOutlinePhoto className="h-4 w-4 shrink-0 text-slate-400" />
                                            <span className="truncate text-xs font-bold text-slate-600">
                                                {imageFile?.name || 'Choose an image file...'}
                                            </span>
                                        </button>

                                        {imagePreview ? (
                                            <div className="flex items-center gap-3 pt-1">
                                                <img
                                                    src={imagePreview}
                                                    alt="Selected notification"
                                                    className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setImageFile(null);
                                                        setImagePreview('');
                                                    }}
                                                    className="text-[10px] font-bold uppercase tracking-widest text-danger hover:opacity-80"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {/* Send Button */}
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handleSend}
                                disabled={!title || !message || isSending}
                                isLoading={isSending}
                            >
                                {!isSending && <HiOutlineBolt className="h-4 w-4" />}
                                {isSending ? 'Sending...' : 'Blast Signal'}
                            </Button>
                        </div>
                    </Card>

                    {emojiPickerOpen && (
                        <div
                            ref={emojiPopoverRef}
                            className="fixed z-[999999] w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
                            style={{ top: emojiPickerPos.top, left: emojiPickerPos.left }}
                            role="dialog"
                            aria-label="Emoji picker"
                        >
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Add Emoji
                                </p>
                                <button
                                    type="button"
                                    onClick={closeEmojiPicker}
                                    className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900"
                                >
                                    Close
                                </button>
                            </div>
                            <div className="grid grid-cols-10 gap-1.5">
                                {EMOJIS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => insertEmoji(emoji)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-slate-50"
                                        aria-label={`Insert ${emoji}`}
                                        title={`Insert ${emoji}`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-[10px] font-bold text-slate-400">
                                Tip: click inside the text field, then pick emojis.
                            </p>
                        </div>
                    )}

                    {/* Tips Card */}
                    <Card className="border-primary/20 bg-primary/5 p-4">
                        <div className="flex gap-3">
                            <HiOutlineExclamationCircle className="h-5 w-5 shrink-0 text-primary" />
                            <div>
                                <h4 className="mb-1 text-sm font-black text-primary">Best Practices</h4>
                                <ul className="space-y-1 text-xs text-primary/80">
                                    <li>• Keep titles under 40 characters for better visibility</li>
                                    <li>• Use emojis sparingly to grab attention</li>
                                    <li>• Test with different audience segments</li>
                                    <li>• Schedule during peak engagement hours</li>
                                </ul>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Sidebar - Preview & Audience */}
                <div className="space-y-5 lg:col-span-1">
                    {/* Real-time Preview */}
                    <div className="space-y-3">
                        <h3 className="px-1 text-sm font-bold text-slate-900">Live Preview</h3>
                        <Card className="border-none bg-gradient-to-br from-slate-900 to-slate-800 p-5">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-400">Live Preview</span>
                                    <Badge variant="success">Locked</Badge>
                                </div>

                                {/* iOS Style Notification */}
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-3 rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary">
                                                <HiOutlineDevicePhoneMobile className="h-3 w-3 text-white" />
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white">{appName}</span>
                                        </div>
                                        <span className="text-[10px] font-semibold text-white/90">Just Now</span>
                                    </div>
                                    <div>
                                        <h4 className="mb-1.5 truncate text-sm font-bold text-white">
                                            {title || 'Hot Deals are back! 🔥'}
                                        </h4>
                                        {imagePreview ? (
                                            <img
                                                src={imagePreview}
                                                alt="Notification attachment"
                                                className="mb-2 h-32 w-full rounded-lg border border-white/10 object-cover"
                                                loading="lazy"
                                            />
                                        ) : null}
                                        <p className="line-clamp-3 text-xs font-medium leading-relaxed text-white/95">
                                            {message || 'Type your message to see it reflect here in real-time...'}
                                        </p>
                                    </div>
                                </motion.div>
                            </div>
                        </Card>
                    </div>

                    {/* Audience Segmentation */}
                    <div className="space-y-3">
                        <h3 className="px-1 text-sm font-bold text-slate-900">Audience Segmentation</h3>
                        <div className="space-y-2">
                            {segments.map((seg) => (
                                <button
                                    key={seg.id}
                                    onClick={() => setSelectedSegment(seg.id)}
                                    className={cn(
                                        "w-full rounded-xl p-3.5 text-left transition-all",
                                        selectedSegment === seg.id
                                            ? "bg-primary text-white shadow-sm"
                                            : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={cn(
                                            "shrink-0 rounded-lg p-2",
                                            selectedSegment === seg.id ? "bg-white/15" : seg.bg
                                        )}>
                                            <seg.icon className={cn(
                                                "h-4.5 w-4.5",
                                                selectedSegment === seg.id ? "text-white" : seg.color
                                            )} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-0.5 flex items-center justify-between">
                                                <h4 className="truncate text-sm font-bold">{seg.label}</h4>
                                                <span className="text-sm font-bold">
                                                    {Number(seg.count || 0).toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                            <p className={cn(
                                                "text-[10px]",
                                                selectedSegment === seg.id ? "text-white/70" : "text-slate-400"
                                            )}>
                                                {seg.description}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotificationComposer;
