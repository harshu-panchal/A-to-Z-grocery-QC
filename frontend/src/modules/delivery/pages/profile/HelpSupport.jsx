import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
} from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { motion, AnimatePresence } from "framer-motion";
import axiosInstance from "@core/api/axios";
import { useSettings } from "@core/context/SettingsContext";
import { legalPagesApi } from "@core/services/legalPagesApi";

const HelpSupport = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const supportPhone = settings?.supportPhone || "";
  const [openIndex, setOpenIndex] = useState(null);

  // Perf audit Phase 8: migrated to React Query — one-time read-only fetch,
  // silently logs on failure exactly like the original (no toast).
  const { data, isLoading: loading } = useQuery({
    queryKey: ["delivery", "helpSupport"],
    queryFn: async () => {
      try {
        const [legalRes, faqRes] = await Promise.all([
          legalPagesApi.get("delivery", "support"),
          axiosInstance.get("/public/faqs", {
            params: { category: "Delivery", status: "published" },
          }),
        ]);
        const legal = legalRes.data?.result ?? legalRes.data;
        const faqData = faqRes.data?.result ?? faqRes.data;
        const list = Array.isArray(faqData?.items)
          ? faqData.items
          : Array.isArray(faqData?.results)
            ? faqData.results
            : [];
        return {
          introHtml: legal?.contentHtml || "",
          introTitle: legal?.title || "Help & Support",
          faqs: list,
        };
      } catch (err) {
        console.error(err);
        return { introHtml: "", introTitle: "Help & Support", faqs: [] };
      }
    },
  });

  const introHtml = data?.introHtml || "";
  const introTitle = data?.introTitle || "Help & Support";
  const faqs = data?.faqs || [];

  const toggleAccordion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">{introTitle}</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {loading && (
          <div className="py-10 flex justify-center">
            <Loader2 className="animate-spin text-slate-400" size={28} />
          </div>
        )}

        {!loading && introHtml && (
          <Card className="p-4">
            <div
              className="prose prose-sm max-w-none text-gray-600"
              dangerouslySetInnerHTML={{ __html: introHtml }}
            />
          </Card>
        )}

        <section className="grid grid-cols-2 gap-4">
          <Card className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
              <MessageCircle size={24} />
            </div>
            <h4 className="font-bold text-gray-800">Chat Support</h4>
            <p className="text-xs text-gray-500 mt-1">Wait time: ~2 mins</p>
          </Card>
          <Card
            className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (supportPhone) window.location.href = `tel:${supportPhone}`;
            }}>
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
              <Phone size={24} />
            </div>
            <h4 className="font-bold text-gray-800">Call Support</h4>
            <p className="text-xs text-gray-500 mt-1">
              {supportPhone || "Available 24/7"}
            </p>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <HelpCircle size={20} className="mr-2 text-primary" /> Frequently
            Asked Questions
          </h2>
          <div className="space-y-3">
            {!loading && faqs.length === 0 && (
              <Card className="p-4 text-center text-sm text-gray-400">
                No FAQs available right now.
              </Card>
            )}
            {faqs.map((faq, index) => (
              <Card
                key={faq._id || index}
                className="overflow-hidden cursor-pointer"
                onClick={() => toggleAccordion(index)}>
                <div className="p-4 flex justify-between items-center bg-white">
                  <h4 className="font-medium text-gray-800 text-sm pr-4">
                    {faq.question}
                  </h4>
                  {openIndex === index ? (
                    <ChevronUp size={18} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-400" />
                  )}
                </div>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-gray-50">
                      <div className="p-4 text-sm text-gray-600 border-t border-gray-100 leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))}
          </div>
        </section>

        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Legal
          </h3>
          <div className="space-y-3">
            <Link
              to="/delivery/terms"
              className="flex items-center gap-2 text-sm font-medium text-gray-800"
            >
              <FileText size={16} /> Terms & Conditions
            </Link>
            <Link
              to="/delivery/privacy"
              className="flex items-center gap-2 text-sm font-medium text-gray-800"
            >
              <FileText size={16} /> Privacy Policy
            </Link>
            <Link
              to="/delivery/about"
              className="flex items-center gap-2 text-sm font-medium text-gray-800"
            >
              <FileText size={16} /> About
            </Link>
          </div>
        </Card>

        <div className="text-center pt-4">
          <p className="text-gray-500 text-sm">Still need help?</p>
          <Button
            variant="link"
            className="text-primary font-bold"
            onClick={() => supportPhone && (window.location.href = `tel:${supportPhone}`)}
          >
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
