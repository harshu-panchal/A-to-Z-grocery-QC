/**
 * Staff without the "pos.cost" permission must never receive purchase rates or
 * profit. The billing screen hides them too, but the server is what enforces
 * it: every POS response is scrubbed before it leaves.
 */
const COST_KEYS = new Set([
  "purchaseRate",
  "purchasePrice",
  "costPrice",
  "wholesaleCost",
  "profit",
  "totalProfit",
  "profitAmount",
  "margin",
]);

export function stripCostFields(value) {
  if (Array.isArray(value)) return value.map(stripCostFields);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const plain = typeof value.toObject === "function" ? value.toObject() : value;
    const out = {};
    for (const [k, v] of Object.entries(plain)) {
      if (!COST_KEYS.has(k)) out[k] = stripCostFields(v);
    }
    return out;
  }
  return value;
}

export function hideCostForStaff(req, res, next) {
  if (!req.pos || req.pos.canSeeCost) return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(stripCostFields(body));
  return next();
}
