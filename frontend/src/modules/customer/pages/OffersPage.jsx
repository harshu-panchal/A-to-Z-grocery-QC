import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useLiveCampaigns } from "../hooks/useLiveCampaigns";
import CampaignDeals from "../components/offers/CampaignDeals";

const OffersPage = () => {
  const { campaigns, isLoading: campaignsLoading } = useLiveCampaigns();
  return (
    <div className="relative z-10 py-8 w-full max-w-[1920px] mx-auto px-4 md:px-[50px] mt-36 md:mt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 text-left"
      >
        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-primary mb-3">
          Best Offers for You
        </h1>
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
  );
};

export default OffersPage;

