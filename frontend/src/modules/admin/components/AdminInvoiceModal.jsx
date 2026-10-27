import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Download, X, Loader2, FileText, Receipt, CheckCircle2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import defaultBrandLogo from '@/assets/atoz-logo.webp';
import { useSettings } from '@core/context/SettingsContext';
import useBodyScrollLock from '@core/hooks/useBodyScrollLock';
import { useToast } from '@shared/components/ui/Toast';
import {
    buildReceiptLines,
    downloadOrderInvoicePdf,
    openOrderInvoicePdf,
    getInvoiceNumber,
} from '../../customer/utils/orderInvoicePdf';

/**
 * Clean iframe printer for HTML elements (A4 format).
 * Opens browser native print dialog without downloading or opening disruptive popups.
 */
function printHtmlElement(element, title = 'Tax Invoice') {
    if (!element) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    // Collect all stylesheets from host document so Tailwind & fonts load in print
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((el) => el.outerHTML)
        .join('\n');

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${title}</title>
            ${styles}
            <style>
                @page {
                    size: A4 portrait;
                    margin: 8mm 10mm;
                }
                @media print {
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    color: #0f172a;
                    background: #ffffff;
                    padding: 0;
                    margin: 0;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                }
                img.invoice-brand-logo {
                    max-height: 36px !important;
                    height: 36px !important;
                    width: auto !important;
                    max-width: 130px !important;
                    object-fit: contain !important;
                    display: inline-block !important;
                    margin: 0 auto 4px auto !important;
                }
            </style>
        </head>
        <body>
            ${element.innerHTML}
        </body>
        </html>
    `);
    doc.close();

    const triggerPrint = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error('Print failed:', e);
        } finally {
            setTimeout(() => {
                iframe.remove();
            }, 1200);
        }
    };

    const imgs = [...doc.images];
    if (!imgs.length) {
        setTimeout(triggerPrint, 150);
    } else {
        Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; }))))
            .then(() => setTimeout(triggerPrint, 150))
            .catch(() => setTimeout(triggerPrint, 150));
    }
}

const AdminInvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const { showToast } = useToast();
    const [viewMode, setViewMode] = useState('a4'); // 'a4' | 'thermal'
    const [isGenerating, setIsGenerating] = useState(false);
    const invoiceSheetRef = useRef(null);

    useBodyScrollLock(isOpen && !!order);

    const invoiceId = useMemo(() => getInvoiceNumber(order) || order?.orderId || order?.id || 'order', [order]);

    const thermalLines = useMemo(() => {
        if (!order || viewMode !== 'thermal') return [];
        try {
            return buildReceiptLines(order, settings || {});
        } catch (e) {
            console.error('Failed to build thermal lines:', e);
            return [];
        }
    }, [order, settings, viewMode]);

    if (!isOpen || !order) return null;

    const items = order.items || [];
    const pricing = order.pricing || {};
    const customer = order.customer || {};
    const address = order.address || {};
    const seller = order.seller || {};

    const customerName = customer.name || address.name || 'Customer';
    const customerPhone = customer.phone || address.phone || '-';
    const fullAddress = [
        address.address,
        address.landmark,
        address.city,
        address.state,
        address.pincode
    ].filter(Boolean).join(', ') || 'No address provided';

    const orderDate = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '-';
    const orderTime = order.createdAt
        ? new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '';

    const paymentMethod = String(order.paymentMode || order.payment?.method || order.paymentMethod || 'CASH').toUpperCase();
    const paymentStatus = String(order.paymentStatus || order.payment?.status || 'PENDING').toUpperCase();

    // Print Handler
    const handlePrint = () => {
        if (viewMode === 'thermal') {
            openOrderInvoicePdf(order, settings || {});
            return;
        }

        if (!invoiceSheetRef.current) return;
        showToast('Opening print dialog...', 'info');
        printHtmlElement(invoiceSheetRef.current, `Invoice_${invoiceId}`);
    };

    // Download PDF Handler
    const handleDownloadPdf = async () => {
        if (isGenerating) return;

        if (viewMode === 'thermal') {
            setIsGenerating(true);
            try {
                await downloadOrderInvoicePdf(order, settings || {});
                showToast('Thermal receipt downloaded successfully', 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to download receipt', 'error');
            } finally {
                setIsGenerating(false);
            }
            return;
        }

        const element = invoiceSheetRef.current;
        if (!element) return;

        setIsGenerating(true);
        showToast('Generating PDF Invoice...', 'info');

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                allowTaint: true,
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const styleSheets = clonedDoc.styleSheets;
                    for (let i = 0; i < styleSheets.length; i++) {
                        try {
                            const rules = styleSheets[i].cssRules || styleSheets[i].rules;
                            for (let j = rules.length - 1; j >= 0; j--) {
                                if (rules[j].cssText && rules[j].cssText.includes('oklch')) {
                                    styleSheets[i].deleteRule(j);
                                }
                            }
                        } catch (e) {
                            // ignore cross-origin stylesheets
                        }
                    }

                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                        :root {
                            --primary: #2563eb !important;
                            --secondary: #64748b !important;
                            --background: #ffffff !important;
                            --foreground: #0f172a !important;
                        }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Invoice_${invoiceId}.pdf`);
            showToast('Invoice downloaded successfully', 'success');
        } catch (error) {
            console.error('PDF generation failed:', error);
            showToast('Failed to generate PDF', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                    className="bg-slate-100 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Order Invoice Preview"
                >
                    {/* Header Controls */}
                    <div className="bg-white px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-black text-slate-900">Invoice #{invoiceId}</h2>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Tax Invoice
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium">
                                    Preview before print or download
                                </p>
                            </div>
                        </div>

                        {/* Format Switcher & Action Buttons */}
                        <div className="flex items-center gap-2">
                            {/* Format toggle tabs */}
                            <div className="hidden sm:flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold mr-1">
                                <button
                                    onClick={() => setViewMode('a4')}
                                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                                        viewMode === 'a4'
                                            ? 'bg-white text-slate-900 shadow-sm font-bold'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    A4 Invoice
                                </button>
                                <button
                                    onClick={() => setViewMode('thermal')}
                                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                                        viewMode === 'thermal'
                                            ? 'bg-white text-slate-900 shadow-sm font-bold'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <Receipt className="h-3.5 w-3.5" />
                                    Thermal (80mm)
                                </button>
                            </div>

                            {/* Print Button */}
                            <button
                                onClick={handlePrint}
                                disabled={isGenerating}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-60"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Print
                            </button>

                            {/* Download Button */}
                            <button
                                onClick={handleDownloadPdf}
                                disabled={isGenerating}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-60"
                            >
                                {isGenerating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Download className="h-3.5 w-3.5" />
                                )}
                                Download PDF
                            </button>

                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                aria-label="Close"
                                className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all ml-1"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Preview Scroll Area */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center">
                        {viewMode === 'thermal' ? (
                            /* Thermal Monospace Preview */
                            <div className="w-full max-w-[380px] bg-white rounded-xl shadow-md border border-slate-200 p-6 font-mono text-[11px] leading-relaxed text-slate-900 overflow-x-auto select-text">
                                <div className="text-center font-bold text-xs uppercase mb-3 text-slate-700 tracking-wider">
                                    80mm Thermal Receipt Preview
                                </div>
                                <div className="p-3 bg-amber-50/40 rounded-lg border border-amber-100 mb-4 text-[10px] text-amber-800 text-center font-sans">
                                    Format optimized for thermal counter printers
                                </div>
                                <div className="space-y-0.5 whitespace-pre font-mono">
                                    {thermalLines.map((row, idx) => (
                                        <div
                                            key={idx}
                                            className={`${row.bold ? 'font-bold text-slate-950' : 'text-slate-800'}`}
                                        >
                                            {row.text || '\u00A0'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* Standard A4 Tax Invoice Preview */
                            <div
                                ref={invoiceSheetRef}
                                className="w-full max-w-[800px] bg-white rounded-xl shadow-md border border-slate-200 p-6 sm:p-8 text-slate-800 select-text"
                                style={{ minHeight: '900px' }}
                            >
                                {/* Brand & Header */}
                                <div className="text-center pb-4 mb-4 border-b border-slate-200">
                                    {settings?.logoUrl ? (
                                        <img
                                            src={settings.logoUrl}
                                            alt="Logo"
                                            className="invoice-brand-logo mx-auto object-contain"
                                            style={{
                                                maxHeight: '36px',
                                                maxWidth: '130px',
                                                height: '36px',
                                                width: 'auto',
                                                objectFit: 'contain',
                                                display: 'inline-block',
                                                marginBottom: '4px'
                                            }}
                                            crossOrigin="anonymous"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <img
                                                src={defaultBrandLogo}
                                                alt="A to Z Grocery Logo"
                                                className="invoice-brand-logo shrink-0"
                                                style={{
                                                    height: '28px',
                                                    width: '28px',
                                                    borderRadius: '50%',
                                                    objectFit: 'cover',
                                                    display: 'inline-block'
                                                }}
                                            />
                                            <span className="text-lg font-black text-slate-900 tracking-tight">
                                                {settings?.appName || 'A to Z Grocery'}
                                            </span>
                                        </div>
                                    )}
                                    <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-slate-500 mt-1">
                                        Official Tax Invoice
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {settings?.companyName || 'Quick Commerce & Supermarket'}
                                        {settings?.address && ` • ${settings.address}`}
                                        {settings?.taxId && ` • GSTIN: ${settings.taxId}`}
                                    </p>
                                </div>

                                {/* Meta Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-4 py-5 border-b border-slate-100">
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                                            Invoice / Reference
                                        </span>
                                        <span className="text-xl font-black text-slate-900 tracking-tight">
                                            #{invoiceId}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                                            Order Date & Time
                                        </span>
                                        <span className="text-sm font-bold text-slate-800">
                                            {orderDate} {orderTime && `at ${orderTime}`}
                                        </span>
                                    </div>
                                </div>

                                {/* Address Information */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-100 text-xs">
                                    {/* Billed To */}
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            Billed & Delivered To
                                        </p>
                                        <p className="text-sm font-bold text-slate-900">{customerName}</p>
                                        <p className="text-slate-600 leading-relaxed">{fullAddress}</p>
                                        <p className="font-semibold text-slate-700 pt-1">
                                            Phone: <span className="font-bold text-slate-900">{customerPhone}</span>
                                        </p>
                                    </div>

                                    {/* Shipped From */}
                                    <div className="space-y-1.5 sm:text-right">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            Shipped From / Merchant
                                        </p>
                                        <p className="text-sm font-bold text-slate-900">
                                            {seller.shopName || settings?.companyName || 'Verified Partner Store'}
                                        </p>
                                        <p className="text-slate-600 leading-relaxed">
                                            {seller.address || settings?.address || 'Main Fulfillment Hub'}
                                        </p>
                                        <p className="font-semibold text-primary pt-1">
                                            {seller.gstin || settings?.taxId ? `GSTIN: ${seller.gstin || settings?.taxId}` : 'Tax Verified Entity'}
                                        </p>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="py-6">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                                                <th className="py-2.5 px-3 text-left">#</th>
                                                <th className="py-2.5 px-3 text-left">Description</th>
                                                <th className="py-2.5 px-3 text-center">Unit Price</th>
                                                <th className="py-2.5 px-3 text-center">Qty</th>
                                                <th className="py-2.5 px-3 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.length > 0 ? (
                                                items.map((it, idx) => {
                                                    const qty = Number(it.quantity ?? it.qty ?? 1);
                                                    const price = Number(it.price ?? 0);
                                                    const lineTotal = qty * price;
                                                    const itemRef = it.product?._id?.slice(-8) || it._id?.slice(-8);

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                            <td className="py-3 px-3 text-slate-400 font-semibold">{idx + 1}</td>
                                                            <td className="py-3 px-3">
                                                                <p className="font-bold text-slate-900">
                                                                    {it.name || it.product?.name || 'Item'}
                                                                    {it.variantName && ` (${it.variantName})`}
                                                                </p>
                                                                {itemRef && (
                                                                    <p className="text-[10px] text-slate-400 font-mono">
                                                                        Ref: {itemRef.toUpperCase()}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-3 text-center text-slate-700 font-medium">
                                                                ₹{price.toFixed(2)}
                                                            </td>
                                                            <td className="py-3 px-3 text-center font-bold text-slate-900">
                                                                {qty}
                                                            </td>
                                                            <td className="py-3 px-3 text-right font-bold text-slate-900">
                                                                ₹{lineTotal.toFixed(2)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                                                        No items listed in order
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Financial Summary */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                                    {/* Payment Method Badge */}
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                                Payment Breakdown
                                            </p>
                                            <p className="text-xs text-slate-700 mb-1">
                                                Mode: <span className="font-bold text-slate-900">{paymentMethod}</span>
                                            </p>
                                            <p className="text-xs text-slate-700">
                                                Status:{' '}
                                                <span
                                                    className={`font-bold ${
                                                        paymentStatus === 'PAID'
                                                            ? 'text-emerald-600'
                                                            : 'text-amber-600'
                                                    }`}
                                                >
                                                    {paymentStatus}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="pt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                            Verified System Generated Invoice
                                        </div>
                                    </div>

                                    {/* Amounts Table */}
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Subtotal</span>
                                            <span className="font-bold text-slate-800">
                                                ₹{Number(pricing.subtotal || 0).toFixed(2)}
                                            </span>
                                        </div>

                                        {Number(pricing.deliveryFee || 0) > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Delivery Charges</span>
                                                <span className="font-bold text-slate-800">
                                                    + ₹{Number(pricing.deliveryFee).toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        {Number(pricing.platformFee || 0) > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Handling Fee</span>
                                                <span className="font-bold text-slate-800">
                                                    + ₹{Number(pricing.platformFee).toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        {Number(pricing.discount || 0) > 0 && (
                                            <div className="flex justify-between text-emerald-600 font-semibold">
                                                <span>Coupon Discount</span>
                                                <span>- ₹{Number(pricing.discount).toFixed(2)}</span>
                                            </div>
                                        )}

                                        {Number(pricing.tax || pricing.gst || 0) > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Taxes / GST Included</span>
                                                <span className="font-bold text-slate-800">
                                                    ₹{Number(pricing.tax || pricing.gst).toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        {Number(pricing.walletAmount || 0) > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Paid from Wallet</span>
                                                <span className="font-bold text-slate-800">
                                                    - ₹{Number(pricing.walletAmount).toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between items-baseline">
                                            <span className="text-sm font-black text-slate-900">Total Paid</span>
                                            <span className="text-xl font-black text-primary">
                                                ₹{Number(pricing.total || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Notes */}
                                <div className="mt-8 pt-6 border-t border-slate-100 text-center text-[10px] text-slate-400 space-y-1">
                                    <p className="font-bold uppercase tracking-widest text-slate-500">
                                        Thank you for choosing {settings?.appName || 'A to Z Grocery'}!
                                    </p>
                                    <p>This is a system-generated commercial invoice. No physical signature required.</p>
                                    <p>
                                        Customer Support:{' '}
                                        <span className="text-slate-600 font-semibold">
                                            {settings?.supportEmail || 'support@atozgrocery.com'}
                                        </span>
                                        {settings?.supportPhone && ` • Tel: ${settings.supportPhone}`}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="bg-white px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
                        <span className="text-xs text-slate-400 font-medium">
                            Choose <span className="font-bold text-slate-700">Print</span> or{' '}
                            <span className="font-bold text-slate-700">Download</span> when ready
                        </span>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
                            >
                                Close
                            </button>
                            <button
                                onClick={handlePrint}
                                disabled={isGenerating}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all flex items-center gap-1.5 disabled:opacity-60"
                            >
                                <Printer className="h-4 w-4" />
                                Print
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={isGenerating}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-white transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                            >
                                {isGenerating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4" />
                                )}
                                Download PDF
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AdminInvoiceModal;
