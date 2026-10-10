import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./atz.css";
import AtzIcon from "./AtzIcon";
import LocationDrawer from "../shared/LocationDrawer";
import CategoryRails from "../home/CategoryRails";
import Shelf from "./Shelf";
import { useLocation } from "../../context/LocationContext";
import { useSettings } from "@core/context/SettingsContext";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import { onlyInStock } from "../../utils/stock";

const savingPct = (p) => {
  const mrp = Number(p.originalPrice ?? p.mrp) || 0;
  const price = Number(p.price ?? p.sellingPrice) || 0;
  return mrp > price && mrp > 0 ? (mrp - price) / mrp : 0;
};

const FALLBACK_CATEGORY_IMAGE = "https://cdn-icons-png.flaticon.com/128/2321/2321831.png";

const TabIcon =({ icon }) => {
  if (!icon) return <AtzIcon name="spark" size={21} />;
  if (typeof icon === "string") return <img src={applyCloudinaryTransform(icon, "f_auto,q_auto,w_100")} alt="" />;
  const Icon = icon;
  return <Icon sx={{ fontSize: 21, color: "inherit" }} size={21} />;
};

/** Mobile home, built 1:1 from the "Enhance Mobile Design" handoff. */
const AtzHome = ({ categories, activeCategory, onCategorySelect, banners, products, quickCategories, categoryMap, offerSections, children }) => {
  const navigate = useNavigate();
  const { currentLocation, isFetchingLocation } = useLocation();
  const { settings } = useSettings();
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const isHeaderTab = Boolean(activeCategory && activeCategory._id !== "all");
  const eta = settings?.estimatedDeliveryTime?.trim() || currentLocation?.time || "15–20 mins";

  const deals = useMemo(() => [...onlyInStock(products || [])].sort((a, b) => savingPct(b) - savingPct(a)), [products]);
  const openCategory = (id) => navigate(`/category/${id}`);
  // Design's "Explore top categories", A–Z: on a header tab only that header's
  // categories, otherwise the first 8 of all categories
  const topCategories = useMemo(() => {
    const headerId = isHeaderTab ? String(activeCategory._id) : null;
    const list = Object.values(categoryMap || {})
      .filter((c) => c.type === "category" && (!headerId || String(c.parentId?._id || c.parentId || "") === headerId))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return headerId ? list : list.slice(0, 8);
  }, [categoryMap, isHeaderTab, activeCategory]);

  return (
    <div className="atz app-shell">
      <header className="header">
        <div className="header-top">
          <div>
            <div className="brand" aria-label="A to Z Grocery">
              <img className="brand-logo" src="/c7ubbuzngz0h3fc6sseo.jpg" alt="" width="36" height="36" />
              <span className="brand-name">A<span className="brand-to">to</span>Z <span className="brand-grocery">Grocery</span></span>
            </div>
            <button type="button" className="location" onClick={() => setIsLocationOpen(true)}>
              <AtzIcon name="pin" size={18} />
              <div>
                <strong>{eta}</strong>
                <span>{isFetchingLocation ? "Detecting location..." : currentLocation?.name || "Select location"}</span>
              </div>
              <AtzIcon name="arrow" size={14} />
            </button>
          </div>
          <button type="button" className="icon-button" aria-label="Notifications" onClick={() => navigate("/notifications")}>
            <AtzIcon name="bell" />
          </button>
        </div>
        <div className="search-box" onClick={() => navigate("/search")}>
          <AtzIcon name="search" />
          <input aria-label="Search products" placeholder={"Search for “chips”"} readOnly onFocus={() => navigate("/search")} />
          <AtzIcon name="mic" size={18} />
        </div>
      </header>

      {categories.length > 0 && (
        <div className="department-tabs">
          {categories.map((cat) => (
            <button key={cat.id} type="button" className={activeCategory?.id === cat.id ? "selected" : ""} onClick={() => onCategorySelect(cat)}>
              <TabIcon icon={cat.icon} />
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      )}

      {banners?.length > 0 && (
        <section className="gaming-banner" aria-label="Offers">
          <div className="banner-track">
            {banners.map((b, i) => (
              <img
                key={`${i}-${b.imageUrl}`}
                src={applyCloudinaryTransform(b.imageUrl, "f_auto,q_auto,c_scale,w_824")}
                alt={b.title || "Offer"}
                loading={i === 0 ? "eager" : "lazy"}
              />
            ))}
          </div>
          <span className="ad-label">AD</span>
        </section>
      )}

      <div className="benefits-strip">
        <span><AtzIcon name="truck" size={14} /> Fast delivery</span>
        <i />
        <span>Minimum order ₹99</span>
        <i />
        <span>Everyday savings</span>
      </div>

      {!isHeaderTab && quickCategories.length > 0 && (
        <section className="quick-categories">
          <div className="section-heading centered">
            <span className="eyebrow">A LITTLE OF EVERYTHING</span>
            <h2>Quick categories</h2>
            <p>A little something for your everyday.</p>
          </div>
          <div className="quick-grid">
            {quickCategories.map((cat) => (
              <button key={cat.id} type="button" onClick={() => openCategory(cat.id)}>
                <div className="category-image">
                  <img src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_150")} alt="" loading="lazy" />
                </div>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isHeaderTab && (
        <Shelf
          className="lowest-section"
          title={<>Lowest price <span className="green-text">ever</span></>}
          subtitle="Unbeatable savings. Updated hourly."
          products={deals}
          onSeeAll={() => navigate("/category/all")}
        />
      )}

      {/* admin "Trending right now" offer sections */}
      {offerSections}

      {!isHeaderTab && (
        <CategoryRails
          key={`${currentLocation?.latitude},${currentLocation?.longitude}`}
          design="atz"
          categoryMap={categoryMap}
          latitude={currentLocation?.latitude}
          longitude={currentLocation?.longitude}
          onSeeAll={openCategory}
        />
      )}

      {/* header-tab browser and admin experience sections */}
      {children}

      {topCategories.length > 0 && (
        <section className="top-categories" id="categories">
          <div className="section-heading">
            <h2>Explore top categories</h2>
            <span className="muted">{topCategories.length} categories</span>
          </div>
          <div className="top-grid">
            {topCategories.map((cat) => (
              <button key={cat._id} type="button" onClick={() => openCategory(cat._id)}>
                <div>
                  <img src={applyCloudinaryTransform(cat.image || FALLBACK_CATEGORY_IMAGE, "f_auto,q_auto,w_130")} alt="" loading="lazy" />
                </div>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <LocationDrawer isOpen={isLocationOpen} onClose={() => setIsLocationOpen(false)} />
    </div>
  );
};

export default AtzHome;
