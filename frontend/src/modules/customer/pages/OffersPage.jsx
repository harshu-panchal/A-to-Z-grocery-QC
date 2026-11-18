import { motion } from "framer-motion";
import { ChevronLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLiveCampaigns } from "../hooks/useLiveCampaigns";
import CampaignDeals from "../components/offers/CampaignDeals";

const OffersPage = () => {
  const navigate = useNavigate();
  const { campaigns, isLoading: campaignsLoading } = useLiveCampaigns();
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
    <div className="sticky top-0 z-30 atz-page-header px-4 pt-4 pb-3 flex items-center gap-2">
      <button
        onClick={() => navigate(-1)}
        aria-label="Go back"
        className="w-10 h-10 flex items-center justify-center hover:bg-white/15 rounded-full transition-colors -ml-1"
      >
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-xl font-semibold tracking-tight">Offers</h1>
    </div>
    <div className="relative z-10 py-6 w-full max-w-[1920px] mx-auto px-4 md:px-[50px]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-left"
      >
        <h2 className="text-2xl md:text-4xl font-black tracking-tight text-primary mb-2">
          Best Offers for You
        </h2>
        <p className="text-gray-500 text-lg font-medium">
          Grab these exclusive deals before they expire!
        </p>
        {!campaignsLoading && campaigns.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
              {campaigns.length} live sale{campaigns.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-600">
              {campaigns.reduce((n, c) => n + (c.products?.length || 0), 0)} products on discount
            </span>
          </div>
        )}
      </motion.div>

      {!campaignsLoading && <CampaignDeals campaigns={campaigns} />}

      {campaignsLoading && (
        <div className="space-y-6" aria-label="Loading offers">
          <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        </div>
      )}

      {!campaignsLoading && campaigns.length === 0 && (
          <div className="mt-16 p-8 bg-slate-100 rounded-[2.5rem] border border-slate-200 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
              <Sparkles size={30} aria-hidden="true" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-4">
              No active offers right now
            </h3>
            <p className="text-slate-500 mb-4 max-w-md mx-auto">
              Check back soon. Our team is curating fresh deals for you.
            </p>
          </div>
        )}
    </div>
    </div>
  );
};

export default OffersPage;

