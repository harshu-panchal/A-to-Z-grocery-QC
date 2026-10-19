import { useMemo, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useSettings } from '@core/context/SettingsContext';
import useBodyScrollLock from '@core/hooks/useBodyScrollLock';
import {
    downloadOrderInvoicePdf,
    openOrderInvoicePdf,
    buildReceiptLines,
    getInvoiceNumber,
} from '../../utils/orderInvoicePdf';

const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const [busy, setBusy] = useState(null); // 'download' | 'print' | null
    // Keep the order page behind the invoice from scrolling.
    useBodyScrollLock(isOpen && !!order);
    const primaryColor = settings?.primaryColor || 'var(--primary)';
    // Same rows the PDF prints, so the preview and the download always match.
    const receipt = useMemo(() => (order ? buildReceiptLines(order, settings || {}) : []), [order, settings]);
    if (!order) return null;

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
                        className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
                    >
                        {/* Header */}
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-800">Invoice</h2>
                                <p className="text-xs text-slate-500 font-medium">#{getInvoiceNumber(order)}</p>
                            </div>
                            <button onClick={onClose} aria-label="Close invoice" className="p-2 bg-white rounded-full hover:bg-slate-200 transition-colors shadow-sm border border-slate-100">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        {/* Receipt preview: 48-column monospace, scrolls sideways on very narrow screens */}
                        <div className="flex-1 min-h-0 overflow-auto overscroll-contain bg-slate-100 p-4" data-lenis-prevent>
                            <pre
                                className="mx-auto w-max bg-white px-3 py-4 shadow-sm font-mono text-[10.5px] sm:text-[11.5px] leading-[1.45] text-slate-900 whitespace-pre"
                                aria-label="Invoice receipt"
                            >
                                {receipt.map((row, i) => (
                                    <span key={i} className={row.bold ? 'font-bold' : undefined}>{row.text}{'\n'}</span>
                                ))}
                            </pre>
                        </div>

                        {/* Footer Actions */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={() => run('print', openOrderInvoicePdf)}
                                disabled={!!busy}
                                className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                            >
                                {busy === 'print' ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />} Print
                            </button>
                            <button
                                onClick={() => run('download', downloadOrderInvoicePdf)}
                                disabled={!!busy}
                                className="flex-1 py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-60"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {busy === 'download' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Download PDF
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;
