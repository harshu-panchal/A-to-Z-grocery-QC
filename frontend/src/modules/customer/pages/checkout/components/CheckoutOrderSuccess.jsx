import React from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * CheckoutOrderSuccess
 *
 * Props:
 *   orderId – string order ID (last 6 chars shown)
 *   show    – boolean — controls visibility via AnimatePresence
 */
const CheckoutOrderSuccess = React.memo(function CheckoutOrderSuccess({ orderId, show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[1000] bg-white flex flex-col items-center justify-center p-6 text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 12 }}
            className="w-24 h-24 bg-primary rounded-full flex items-center justify-center text-primary-foreground mb-6 shadow-lg">
            <Check size={48} strokeWidth={3.5} />
          </motion.div>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-bold text-slate-900 mb-1">
            Order placed!
          </motion.h2>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-sm font-semibold text-slate-700 mb-4">
            Order #{orderId?.slice(-6)}
          </motion.p>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="max-w-xs text-sm text-slate-500 mb-8">
            We&apos;re confirming it with the store now. If the store can&apos;t accept it within a minute,
            it&apos;s cancelled automatically and any payment is refunded.
            <br />
            <span className="mt-2 block font-medium text-slate-600">Taking you to your order…</span>
          </motion.p>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 2.5, ease: "linear" }}
            className="w-48 h-1.5 bg-brand-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default CheckoutOrderSuccess;
