import React, { useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { legalPagesApi } from "@core/services/legalPagesApi";
import { cn } from "@/lib/utils";

/**
 * Shared legal document viewer — fetches and renders sanitized HTML.
 */
const LegalDocumentView = ({
  audience,
  pageType,
  fallbackTitle = "Legal",
  icon: Icon,
  className,
  contentClassName,
  backTo,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(fallbackTitle);
  const [html, setHtml] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    legalPagesApi
      .get(audience, pageType)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.result ?? res.data;
        setTitle(data?.title || fallbackTitle);
        setHtml(data?.contentHtml || "");
        setUpdatedAt(data?.updatedAt || null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError("Unable to load this page. Please try again later.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audience, pageType, fallbackTitle]);

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className={cn("min-h-screen bg-slate-50 font-sans pb-10", className)}>
      <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-1 shadow-sm">
        <button
          type="button"
          onClick={handleBack}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-black text-slate-800 truncate">{title}</h1>
      </div>

      <div className="p-5 max-w-3xl mx-auto">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          {(Icon || updatedAt) && (
            <div className="flex items-center gap-4 mb-6">
              {Icon && (
                <div className="h-12 w-12 rounded-2xl bg-brand-50 flex items-center justify-center text-primary shrink-0">
                  <Icon size={24} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-800 truncate">
                  {title}
                </h2>
                {updatedAt && (
                  <p className="text-xs text-slate-500 font-medium">
                    Last updated:{" "}
                    {new Date(updatedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="py-16 flex justify-center">
              <Loader2 className="animate-spin text-slate-400" size={28} />
            </div>
          )}

          {!loading && error && (
            <p className="text-sm font-medium text-red-500 text-center py-10">
              {error}
            </p>
          )}

          {!loading && !error && !html && (
            <p className="text-sm font-medium text-slate-400 text-center py-10">
              Content coming soon.
            </p>
          )}

          {!loading && !error && html && (
            <div
              className={cn(
                "prose prose-slate prose-sm max-w-none text-slate-600 legal-html-content",
                "[&_h2]:text-slate-800 [&_h2]:font-bold [&_h2]:text-lg [&_h2]:mt-6",
                "[&_h3]:text-slate-800 [&_h3]:font-bold [&_h3]:text-base [&_h3]:mt-6",
                "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
                "[&_a]:text-primary [&_a]:underline",
                contentClassName,
              )}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LegalDocumentView;
