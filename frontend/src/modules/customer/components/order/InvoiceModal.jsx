import { useMemo, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useSettings } from '@core/context/SettingsContext';
import useBodyScrollLock from '@core/hooks/useBodyScrollLock';
import {
    downloadOrderInvoicePdf,
    openOrderInvoicePdf,
    getInvoiceSummary,
    getInvoiceNumber,
} from '../../utils/orderInvoicePdf';

const formatAmount = (value) => {
    const n = Number(value) || 0;
    return `${n < 0 ? '- ' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

/**
 * On screen: a simple invoice card. Print / Download produce the thermal
 * receipt format (see utils/orderInvoicePdf.js).
 */
const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const [busy, setBusy] = useState(null); // 'download' | 'print' | null
    // Keep the order page behind the invoice from scrolling.
    useBodyScrollLock(isOpen && !!order);
    const appName = settings?.appName || 'App';
    const primaryColor = settings?.primaryColor || 'var(--primary)';
    const summary = useMemo(() => (order ? getInvoiceSummary(order) : null), [order]);
    if (!order || !summary) return null;

    const address = order.address || {};
    const billName = address.name || order.customer?.name || 'Customer';
    const billPhone = address.phone || order.customer?.phone || '';

    const run = async (kind, action) => {
        if (busy) return;
        setBusy(kind);
        try {
            await action(order, settings || {});
        } catch (error) {
            // A dismissed share sheet is not a failure.
            if (error?.name !== 'AbortError') {
                console.error('Invoice generation failed:', error);
                toast.error('Could not generate the invoice. Please try again.');
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Order invoice"
                        className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
                    >
                        {/* Header */}
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="min-w-0">
                                <h2 className="text-lg font-black text-slate-800">Invoice</h2>
                                <p className="text-xs text-slate-500 font-medium flex flex-wrap items-center gap-1.5">
                                    <span>#{getInvoiceNumber(order)}</span>
                                    {order.createdAt && (
                                        <>
                                            <span className="text-slate-300">•</span>
                                            <span>Date: {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                        </>
                                    )}
                                </p>
                            </div>
                            <button onClick={onClose} aria-label="Close invoice" className="p-2 bg-white rounded-full hover:bg-slate-200 transition-colors shadow-sm border border-slate-100">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        {/* Card */}
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-6" data-lenis-prevent>
                            <div className="flex justify-between items-start gap-4">
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>{appName}</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {settings?.companyName || 'Quick Commerce'}
                                        {settings?.address && <><br />{settings.address}</>}
                                        {settings?.taxId && <><br />GSTIN: {settings.taxId}</>}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-bold text-slate-800">Bill To:</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {billName}
                                        {billPhone && <><br />{billPhone}</>}
                                    </p>
                                    {order.createdAt && (
                                        <p className="text-xs font-semibold text-slate-600 mt-2">
                                            Date: {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="border rounded-xl overflow-hidden border-slate-100">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-3">Item</th>
                                            <th className="px-4 py-3 text-right">Qty</th>
                                            <th className="px-4 py-3 text-right">Price</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {summary.lines.map((line, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3 text-slate-700 font-medium">
                                                    {line.name}
                                                    {line.qty > 1 && (
                                                        <span className="block text-[11px] text-slate-400 font-normal">{formatAmount(line.rate)} each</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 text-right">{line.qty}</td>
                                                <td className="px-4 py-3 text-slate-800 font-bold text-right">{formatAmount(line.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                {summary.rows.map(([label, value]) => (
                                    <div key={label} className="flex justify-between text-sm text-slate-500">
                                        <span>{label}</span>
                                        <span className={Number(value) < 0 ? 'text-emerald-600' : undefined}>{formatAmount(value)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-base font-black text-slate-800 pt-2 border-t border-slate-100">
                                    <span>Total Paid</span>
                                    <span>{formatAmount(summary.total)}</span>
                                </div>
                                {summary.walletUsed > 0 && (
                                    <p className="text-[11px] text-slate-400 text-right">incl. {formatAmount(summary.walletUsed)} from wallet</p>
                                )}
                                {summary.saved > 0 && (
                                    <p className="text-xs font-bold text-emerald-600 text-center pt-1">You saved {formatAmount(summary.saved)} on this order</p>
                                )}
                            </div>
                        </div>

                        {/* Footer: Print (receipt format) is the main action */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-2">
                            <button
                                onClick={() => run('print', openOrderInvoicePdf)}
                                disabled={!!busy}
                                className="w-full py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-60"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {busy === 'print' ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />} Print
                            </button>
                            <button
                                onClick={() => run('download', downloadOrderInvoicePdf)}
                                disabled={!!busy}
                                className="w-full py-2 text-xs font-bold flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-60"
                            >
                                {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;
