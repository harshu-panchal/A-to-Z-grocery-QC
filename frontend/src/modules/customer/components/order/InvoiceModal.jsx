import React from 'react';
import { X, Printer, Download, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';

const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const primaryColor = settings?.primaryColor || 'var(--primary)';
    if (!order) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
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
                            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative"
                        >
                            {/* Header */}
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black text-slate-800">Invoice</h2>
                                    <p className="text-xs text-slate-500 font-medium">#{order.id}</p>
                                </div>
                                <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-200 transition-colors shadow-sm border border-slate-100">
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Printable Area */}
                            <div className="p-8 space-y-6" id="printable-invoice">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>{appName}</h1>
                                        <p className="text-xs text-slate-500 print:text-black mt-1">{settings?.companyName || 'Quick Commerce'}<br />{settings?.address || '—'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800 print:text-black">Bill To:</p>
                                        <p className="text-xs text-slate-500 print:text-black mt-1">{order.address.name}<br />{order.address.phone}</p>
                                    </div>
                                </div>

                                <div className="border rounded-xl overflow-hidden border-slate-100 print:border-black">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 print:bg-transparent print:text-black print:border-black">
                                            <tr>
                                                <th className="px-4 py-3">Item</th>
                                                <th className="px-4 py-3 text-right">Qty</th>
                                                <th className="px-4 py-3 text-right">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 print:divide-black">
                                            {order.items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-4 py-3 text-slate-700 print:text-black font-medium">{item.name || item.product?.name}</td>
                                                    <td className="px-4 py-3 text-slate-500 print:text-black text-right">{item.quantity || item.qty}</td>
                                                    <td className="px-4 py-3 text-slate-800 print:text-black font-bold text-right">₹{item.price}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100 print:border-black">
                                    <div className="flex justify-between text-sm text-slate-500 print:text-black">
                                        <span>Subtotal</span>
                                        <span>₹{order.pricing?.subtotal || 0}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-500 print:text-black">
                                        <span>Tax</span>
                                        <span>₹{order.pricing?.gst || 0}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-black text-slate-800 print:text-black pt-2 border-t border-slate-100 print:border-black">
                                        <span>Total Paid</span>
                                        <span>₹{order.pricing?.total || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 print:hidden">
                                <button onClick={handlePrint} className="flex-1 py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg" style={{ backgroundColor: primaryColor }}>
                                    <Printer size={18} /> Print
                                </button>
                            </div>

                            <style>
                                {`
                                    @media print {
                                        body * { visibility: hidden; }
                                        #printable-invoice, #printable-invoice * { visibility: visible; }
                                        #printable-invoice { 
                                            position: absolute !important; 
                                            left: 0 !important; 
                                            top: 0 !important; 
                                            width: 100% !important; 
                                            -webkit-print-color-adjust: exact;
                                            print-color-adjust: exact;
                                        }
                                        /* Prevent clipping and transform context issues */
                                        .fixed, .relative, .absolute {
                                            position: static !important;
                                            transform: none !important;
                                        }
                                        .overflow-hidden {
                                            overflow: visible !important;
                                        }
                                        .max-w-lg {
                                            max-width: 100% !important;
                                        }
                                    }
                                `}
                            </style>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;

