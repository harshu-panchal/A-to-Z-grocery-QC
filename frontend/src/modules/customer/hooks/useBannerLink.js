import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import { useProductDetail } from "../context/ProductDetailContext";

// Where a banner's admin-set link (linkType + linkValue) points. Headers,
// categories and subcategories all open /category/:id, which resolves the
// level itself. Returns null when the banner has no usable link.
export function bannerTarget(banner) {
  const type = banner?.linkType;
  const value = String(banner?.linkValue || "").trim();
  if (!value || !type || type === "none") return null;
  if (type === "product") return { productId: value };
  if (type === "header" || type === "category" || type === "subcategory") {
    return { to: `/category/${value}` };
  }
  if (type === "url") {
    if (value.startsWith("/")) return { to: value };
    if (/^https?:\/\//i.test(value)) return { href: value };
  }
  return null;
}

// Same shape the home page gives product cards, so the detail popup
// renders a banner's product exactly like a tapped card.
const toCardProduct = (p) => ({
  ...p,
  id: p._id,
  image: p.mainImage || p.image,
  price: p.sellingPrice || p.mrp,
  originalPrice: p.mrp,
  weight: p.weight || "1 unit",
  deliveryTime: "8-15 mins",
});

export function useBannerLink() {
  const navigate = useNavigate();
  const { openProduct } = useProductDetail();
  const { currentLocation } = useAppLocation();

  return useCallback(
    async (banner) => {
      const target = bannerTarget(banner);
      if (!target) return;
      if (target.href) {
        window.open(target.href, "_blank", "noopener,noreferrer");
        return;
      }
      if (target.to) {
        navigate(target.to);
        return;
      }
      // Product: open the same popup a product card opens.
      const lat = currentLocation?.latitude;
      const lng = currentLocation?.longitude;
      try {
        const params = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {};
        const res = await customerApi.getProductById(target.productId, params);
        const product = res.data?.result;
        if (!product) throw new Error("not found");
        openProduct?.(toCardProduct(product));
      } catch {
        toast.error("This product isn't available at your location yet");
      }
    },
    [navigate, openProduct, currentLocation?.latitude, currentLocation?.longitude],
  );
}
