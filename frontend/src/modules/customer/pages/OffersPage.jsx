import { useQuery } from "@tanstack/react-query";
import { Tag, Sparkles, Clock, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";

const OffersPage = () => {
  const navigate = useNavigate();
  // Perf audit Phase 8: migrated to React Query.
  const { data: legacyOffers = [], isLoading } = useQuery({
    queryKey: ["customer", "offers"],
    queryFn: async () => {
      const offersRes = await customerApi.getOffers().catch(() => ({ data: {} }));
      const offersList =
        offersRes.data?.results ||
        offersRes.data?.result ||
        offersRes.data ||
        [];
      return Array.isArray(offersList) ? offersList : [];
    },
  });

  const styleToBg = {
    blue: "bg-black ",
    green: "bg-primary",
    orange: "bg-orange-500",
  };
  const iconFor = (icon) => {
    if (icon === "clock") return <Clock className="text-white" size={32} />;
    if (icon === "tag") return <Tag className="text-white" size={32} />;
    return <Sparkles className="text-white" size={32} />;
  };

  // Tapping a card opens what the admin attached to the offer: its first
  // category, else its first product, else copies the code.
  const idOf = (v) => (v && typeof v === "object" ? v._id : v);
  const offerAction = (offer) => {
    const categoryId = idOf(offer.categoryIds?.[0]);
    if (categoryId) return () => navigate(`/category/${categoryId}`);
    const productId = idOf(offer.productIds?.[0]);
    if (productId) return () => navigate(`/product/${productId}`);
    if (offer.code) {
      return () =>
        navigator.clipboard?.writeText(offer.code)
          .then(() => toast.success(`Code ${offer.code} copied`))
          .catch(() => {});
    }
    return undefined;
  };

  const sortedLegacyOffers = [...legacyOffers]
    .filter((o) => o.status === "active")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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
      </motion.div>

      {isLoading && (
        <div className="mt-12 text-center text-slate-400 text-sm font-bold">
          Loading offers...
        </div>
      )}

      {/* Legacy offer cards (promo codes / first-order type) */}
      {!isLoading && sortedLegacyOffers.length > 0 && (
        <div className="mt-14">
          <h3 className="text-xl font-black text-slate-800 mb-4">
            Coupon deals
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedLegacyOffers.map((offer) => {
              const open = offerAction(offer);
              return (
              <div
                key={offer._id}
                onClick={open}
                role={open ? "button" : undefined}
                className={`relative overflow-hidden rounded-3xl group shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 ${open ? "cursor-pointer" : ""}`}
              >
                <div
                  className={`${styleToBg[offer.style] || styleToBg.blue
                    } p-8 h-full flex flex-col justify-between text-white relative z-10`}
                >
                  <div>
                    <div className="bg-white/20 p-3 rounded-2xl w-fit mb-6 backdrop-blur-md">
                      {iconFor(offer.icon)}
                    </div>
                    <h2 className="text-3xl font-black mb-3 leading-tight">
                      {offer.title}
                    </h2>
                    <p className="text-white/80 font-medium mb-8 leading-relaxed">
                      {offer.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex flex-col items-end gap-2">
                      {offer.code && (
                        <div className="bg-black/20 px-4 py-2 rounded-xl font-mono font-bold tracking-widest text-lg">
                          {offer.code}
                        </div>
                      )}
                      {offer.appliesOnOrderNumber && (
                        <span className="text-xs font-bold text-white/80">
                          Applies on order #{offer.appliesOnOrderNumber}
                        </span>
                      )}
                    </div>
                    {open && (
                      <span aria-hidden="true" className="h-12 w-12 bg-white rounded-full flex items-center justify-center text-primary transform transition-transform group-hover:rotate-[-45deg]">
                        <ArrowRight size={24} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
              </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading &&
        sortedLegacyOffers.length === 0 && (
          <div className="mt-16 p-8 bg-slate-100 rounded-[2.5rem] border border-slate-200 text-center">
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

