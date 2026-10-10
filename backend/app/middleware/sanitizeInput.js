/**
 * Strips MongoDB operator keys (`$gt`, `$ne`, `$where`, ...) and
 * prototype-pollution keys from parsed request bodies.
 *
 * Without this, a JSON body like `{ "phone": { "$ne": null } }` reaches
 * Mongoose as a query operator instead of a value (NoSQL injection).
 * `req.query` needs no handling: Express 5's default "simple" query parser
 * never produces nested objects, only strings and string arrays.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripUnsafeKeys(value, depth = 0) {
  if (depth > 20) return value;
  if (Array.isArray(value)) {
    for (const item of value) stripUnsafeKeys(item, depth + 1);
    return value;
  }
  if (!isPlainObject(value)) return value;
  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || FORBIDDEN_KEYS.has(key)) {
      delete value[key];
    } else {
      stripUnsafeKeys(value[key], depth + 1);
    }
  }
  return value;
}

export function sanitizeRequestBody(req, res, next) {
  if (req.body) stripUnsafeKeys(req.body);
  next();
}
