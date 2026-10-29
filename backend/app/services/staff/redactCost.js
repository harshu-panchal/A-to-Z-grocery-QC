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

// A customer's due / advance (udhaar) and the shop's total outstanding.
const DUE_KEYS = new Set(["creditBalance", "creditLimit", "creditDue"]);

export function stripCostFields(value, keys = COST_KEYS) {
  if (Array.isArray(value)) return value.map((v) => stripCostFields(v, keys));
  if (value && typeof value === "object") {
    const plain = typeof value.toObject === "function" && !value._bsontype ? value.toObject() : value;
    // Only walk plain data. IDs (ObjectId), dates, buffers etc. go out as they
    // are; taking them apart turned every _id into {} and broke the screens.
    const proto = Object.getPrototypeOf(plain);
    if (proto !== Object.prototype && proto !== null) return plain;
    const out = {};
    for (const [k, v] of Object.entries(plain)) {
      if (!keys.has(k)) out[k] = stripCostFields(v, keys);
    }
    return out;
  }
  return value;
}

export function hideCostForStaff(req, res, next) {
  if (!req.pos) return next();
  const keys = new Set([...(req.pos.canSeeCost ? [] : COST_KEYS), ...(req.pos.canSeeDues === false ? DUE_KEYS : [])]);
  if (!keys.size) return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(stripCostFields(body, keys));
  return next();
}
