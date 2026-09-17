import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  Phone,
  Loader2,
} from "lucide-react";
import axiosInstance from "@core/api/axios";
import { useSettings } from "@core/context/SettingsContext";
import { legalPagesApi } from "@core/services/legalPagesApi";

const SellerSupportPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const supportEmail = settings?.supportEmail || "";
  const supportPhone = settings?.supportPhone || "";
  const [faqs, setFaqs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [introHtml, setIntroHtml] = useState("");
  const [introTitle, setIntroTitle] = useState("Seller Support");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [legalRes, faqRes] = await Promise.all([
          legalPagesApi.get("seller", "support"),
          axiosInstance.get("/public/faqs", {
            params: { category: "Seller", status: "published" },
          }),
        ]);
        if (cancelled) return;
        const legal = legalRes.data?.result ?? legalRes.data;
        setIntroHtml(legal?.contentHtml || "");
        setIntroTitle(legal?.title || "Seller Support");
        const faqData = faqRes.data?.result ?? faqRes.data;
        const list = Array.isArray(faqData?.items)
          ? faqData.items
          : Array.isArray(faqData?.results)
            ? faqData.results
            : [];
        setFaqs(list);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pb-16 font-sans">
      <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-1 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-black text-slate-800">{introTitle}</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {loading && (
          <div className="py-16 flex justify-center">
            <Loader2 className="animate-spin text-slate-400" size={28} />
          </div>
        )}

        {!loading && introHtml && (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div
              className="prose prose-slate prose-sm max-w-none text-slate-600"
              dangerouslySetInnerHTML={{ __html: introHtml }}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {supportPhone && (
            <a
              href={`tel:${supportPhone}`}
              className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3 hover:border-slate-200 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-primary">
                <Phone size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Call
                </p>
                <p className="text-sm font-bold text-slate-800">{supportPhone}</p>
              </div>
            </a>
          )}
          {supportEmail && (
            <a
              href={`mailto:${supportEmail}`}
              className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3 hover:border-slate-200 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-primary">
                <Mail size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Email
                </p>
                <p className="text-sm font-bold text-slate-800 truncate max-w-[180px]">
                  {supportEmail}
                </p>
              </div>
            </a>
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3 px-1">
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {faqs.length === 0 && !loading && (
              <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 text-sm text-slate-400 text-center">
                No FAQs available right now.
              </div>
            )}
            {faqs.map((faq) => {
              const open = openId === faq._id;
              return (
                <div
                  key={faq._id}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : faq._id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="text-sm font-bold text-slate-800">
                      {faq.question}
                    </span>
                    {open ? (
                      <ChevronUp size={16} className="text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-slate-400 shrink-0"
                      />
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Legal
          </h3>
          <div className="space-y-3">
            <Link
              to="/seller/terms"
              className="flex items-center gap-2.5 text-slate-700 hover:text-slate-900 font-medium"
            >
              <FileText size={18} /> Terms & Conditions
            </Link>
            <Link
              to="/seller/privacy"
              className="flex items-center gap-2.5 text-slate-700 hover:text-slate-900 font-medium"
            >
              <FileText size={18} /> Privacy Policy
            </Link>
            <Link
              to="/seller/about"
              className="flex items-center gap-2.5 text-slate-700 hover:text-slate-900 font-medium"
            >
              <FileText size={18} /> About
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellerSupportPage;
