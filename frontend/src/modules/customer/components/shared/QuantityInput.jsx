import { useEffect, useState } from "react";
import { useCart } from "../../context/CartContext";

/**
 * Cart quantity the customer can also type. Commits on Enter or blur; an
 * empty/0 value removes the item, a value above stock is capped (with a toast).
 */
const QuantityInput = ({ productId, variantSku = "", quantity, className, label }) => {
  const { setQuantity } = useCart();
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => setDraft(String(quantity)), [quantity]);

  const commit = () => {
    if (draft === String(quantity)) return;
    if (draft.trim() === "") return setDraft(String(quantity));
    setQuantity(productId, Number(draft), variantSku);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      aria-label={label || "Quantity"}
      value={draft}
      className={className}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(String(quantity)); e.currentTarget.blur(); }
      }}
    />
  );
};

export default QuantityInput;
