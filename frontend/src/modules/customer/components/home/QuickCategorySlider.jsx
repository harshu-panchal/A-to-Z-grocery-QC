import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { QUICK_CATEGORY_PALETTES } from "../../constants/homeConstants";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import QuickCategoriesBg from "@/assets/Catagorysection_bg.webp";

const QuickCategorySlider = ({ categories, onCategoryClick }) => {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -300 : 300;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (!categories || categories.length === 0) return null;

  return (
    <section aria-labelledby="quick-categories-title" className="relative z-20 mx-auto mb-7 w-full max-w-[1440px] px-3 md:mb-10 md:px-8 lg:px-12">
      <div
        className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.07)] md:rounded-[26px]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.65) 100%), url(${QuickCategoriesBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}>
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />

        <div className="relative z-10 px-4 pb-2 pt-4 md:px-8 md:pb-3 md:pt-6">
          <h2 id="quick-categories-title" className="text-center text-base font-bold tracking-tight text-slate-900 md:text-lg">
            Quick categories
          </h2>
          <p className="mt-1 text-center text-[11px] font-medium text-slate-500 md:text-xs">A little something for every aisle</p>
        </div>

        {/* Left Scroll Button */}
        <div className="absolute left-4 lg:left-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
          <button
            onClick={() => scroll("left")}
            className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all active:scale-90">
            <ChevronLeft size={22} strokeWidth={3} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="relative z-10 flex items-start gap-3 overflow-x-auto no-scrollbar px-4 pb-5 pt-2 md:gap-4 md:px-8 md:pb-7 snap-x scroll-smooth">
          {categories.map((cat, idx) => {
            const palette = QUICK_CATEGORY_PALETTES[idx % QUICK_CATEGORY_PALETTES.length];
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryClick(cat.id)}
                aria-label={`Browse ${cat.name}`}
                className="group/item flex min-w-[76px] cursor-pointer flex-col items-center gap-2 snap-start text-center transition-transform active:scale-95 md:min-w-[104px] lg:min-w-[116px]">
                <div
                  className="relative flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-2xl border p-1.5 shadow-[0_5px_16px_rgba(15,23,42,0.07)] transition-all duration-300 group-hover/item:-translate-y-1 group-hover/item:shadow-[0_12px_24px_rgba(15,23,42,0.12)] smooth-transform md:h-[96px] md:w-[96px] md:rounded-[22px] md:p-2"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.6) 24%, rgba(255,255,255,0.15) 100%), linear-gradient(135deg, ${palette.bgFrom}, ${palette.bgVia}, ${palette.bgTo})`,
                    borderColor: palette.frameColor,
                  }}>
                  <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{ backgroundColor: palette.glowColor }}
                  />
                  <img
                    src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_150")}
                    alt={cat.name}
                    loading="lazy"
                    className="relative z-10 h-[54px] w-[54px] object-contain drop-shadow-[0_5px_12px_rgba(0,0,0,0.10)] mix-blend-multiply transition-transform duration-500 group-hover/item:scale-110 md:h-[68px] md:w-[68px]"
                  />
                </div>
                <span className="block max-w-full truncate text-[10px] font-semibold leading-tight text-slate-700 transition-colors group-hover/item:text-primary md:text-xs">{cat.name}</span>
              </button>
            );
          })}
        </div>

        {/* Right Scroll Button */}
        <div className="absolute right-4 lg:right-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
          <button
            onClick={() => scroll("right")}
            className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all active:scale-90">
            <ChevronRight size={22} strokeWidth={3} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default React.memo(QuickCategorySlider);
