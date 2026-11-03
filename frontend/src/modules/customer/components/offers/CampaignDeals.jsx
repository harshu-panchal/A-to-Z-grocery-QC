import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Clock, Tag, ArrowRight } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { isProductOutOfStock } from "../../utils/stock";
import { timeLeft } from "@shared/utils/campaignUi";

// Same card look the Offers page always had (dark / green / orange cards).
const CARD_BG = ["bg-black", "bg-primary", "bg-orange-500"];
const CARD_ICON = [Sparkles, Clock, Tag];

const toCardProduct = (p) => ({
  ...p,
  id: p._id,
  image: p.mainImage || p.image || null,
  price: p.sellingPrice || p.mrp,
  originalPrice: p.mrp,
  weight: p.weight || "1 unit",
  deliveryTime: "8-15 mins",
});

const savingPct = (p) => (p.mrp > 0 && p.sellingPrice < p.mrp ? (p.mrp - p.sellingPrice) / p.mrp : 0);

/** Re-render every minute so "Ends in" counts down. */
const useMinuteTick = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
};

const PREVIEW_COUNT = 12;
const sectionId = (c) => `sale-${c._id}`;

const CampaignProducts = ({ campaign, products }) => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? products : products.slice(0, PREVIEW_COUNT);
  const left = timeLeft(campaign.endAt);
  return (
    <section id={sectionId(campaign)} className="mt-14 scroll-mt-40" aria-label={`${campaign.name} products`}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">On sale now</p>
          <h3 className="mt-1 text-2xl font-black capitalize tracking-tight text-slate-900 md:text-3xl">
            {campaign.name}
          </h3>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {products.length} product{products.length === 1 ? "" : "s"} · {campaign.discountLabel}
            {left ? ` · ends in ${left}` : ""}
          </p>
        </div>
        {campaign.categories?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {campaign.categories.map((cat) => (
              <button
                key={cat._id}
                type="button"
                onClick={() => navigate(`/category/${cat._id}`)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-primary hover:text-primary"
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-6">
        {shown.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {products.length > PREVIEW_COUNT && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {showAll ? "Show less" : `See all ${products.length} deals`}
          </button>
        </div>
      )}
    </section>
  );
};

/** Live sale campaigns: offer cards on top, their discounted products below. */
const CampaignDeals = ({ campaigns }) => {
  useMinuteTick();
  const live = (campaigns || [])
    .map((c) => ({
      campaign: c,
      products: (c.products || [])
        .filter((p) => !isProductOutOfStock(p))
        .sort((a, b) => savingPct(b) - savingPct(a))
        .map(toCardProduct),
    }))
    .filter((x) => x.products.length > 0);
  if (!live.length) return null;

  const open = (c) => document.getElementById(sectionId(c))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <div className={`grid grid-cols-1 gap-6 ${live.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {live.map(({ campaign: c }, idx) => {
          const Icon = CARD_ICON[idx % CARD_ICON.length];
          const left = timeLeft(c.endAt);
          const [big, ...rest] = String(c.discountLabel || "").split(" off");
          return (
            <div
              key={c._id}
              onClick={() => open(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(c)}
              className="relative overflow-hidden rounded-3xl group shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 cursor-pointer"
            >
              <div className={`${CARD_BG[idx % CARD_BG.length]} relative z-10 flex h-full flex-col gap-6 p-6 text-white sm:p-8 md:flex-row md:items-center md:p-10`}>
                {/* left: text */}
                <div className="flex flex-1 flex-col items-start">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="rounded-2xl bg-white/20 p-3 backdrop-blur-md">
                      <Icon className="text-white" size={28} />
                    </span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-widest">
                      Limited time sale
                    </span>
                  </div>
                  <h2 className="mb-3 text-3xl font-black capitalize leading-tight md:text-5xl">{c.name}</h2>
                  {c.description && (
                    <p className="mb-6 max-w-xl font-medium leading-relaxed text-white/80">{c.description}</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-3">
                    <span className="rounded-xl bg-white px-4 py-2 text-lg font-black text-slate-900">
                      {c.discountLabel}
                    </span>
                    {left && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
                        <Clock size={16} aria-hidden="true" /> Ends in {left}
                      </span>
                    )}
                  </div>
                  <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-primary transition-transform group-hover:translate-x-1">
                    Shop the sale <ArrowRight size={18} aria-hidden="true" />
                  </span>
                </div>

                {/* right: uploaded banner, else a big discount mark */}
                {c.bannerImage ? (
                  <img
                    src={c.bannerImage}
                    alt=""
                    className="h-48 w-full rounded-2xl object-cover md:h-64 md:w-[45%]"
                  />
                ) : (
                  <div aria-hidden="true" className="hidden select-none text-right md:block md:w-[40%]">
                    <p className="text-[110px] font-black leading-none tracking-tighter text-white/90 lg:text-[140px]">{big}</p>
                    <p className="text-4xl font-black uppercase tracking-widest text-white/60">off{rest.join(" off")}</p>
                  </div>
                )}
              </div>
              <div className="absolute top-[-10%] right-[-10%] w-60 h-60 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
            </div>
          );
        })}
      </div>

      {live.map(({ campaign, products }) => (
        <CampaignProducts key={campaign._id} campaign={campaign} products={products} />
      ))}
    </>
  );
};

export default CampaignDeals;
