import StaffActivity from "../../models/staffActivity.js";

const clientIp = (req) =>
  String(req?.headers?.["x-forwarded-for"] || req?.ip || req?.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

/** Write one activity row. Never throws: logging must not break a request. */
export async function recordStaffActivity({ staff, kind = "action", action, detail = "", amount, req, status }) {
  try {
    await StaffActivity.create({
      ownerType: staff.ownerType,
      ownerId: staff.ownerType === "seller" ? staff.ownerId : null,
      staffId: staff.id,
      staffName: staff.name,
      jobTitle: staff.jobTitle || "",
      kind,
      action,
      detail,
      amount: Number.isFinite(amount) ? amount : undefined,
      method: req?.method,
      path: req ? String(req.originalUrl || "").split("?")[0].slice(0, 200) : undefined,
      status,
      ip: req ? clientIp(req) : undefined,
    });
  } catch {
    /* ignore */
  }
}

const first = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
};

/** Pull a human-readable reference (bill number, name) and amount out of a response. */
export function describeResult(body, reqBody) {
  const result = body?.result ?? body?.results;
  const row = Array.isArray(result) ? result[0] : result;
  const ref = first(row, ["invoiceNumber", "invoiceNo", "orderId", "billNo", "name", "title", "code", "shopName"]);
  const fallback = first(reqBody, ["name", "title", "code"]);
  const amount = Number(first(row, ["total", "grandTotal", "amount"]));
  const label = ref ?? fallback;
  const isBill = first(row, ["invoiceNumber", "invoiceNo", "orderId"]) !== undefined;
  return {
    detail: label === undefined ? "" : `${isBill ? "#" : ""}${String(label).slice(0, 120)}`,
    amount: Number.isFinite(amount) ? amount : undefined,
  };
}

/** Log a staff write once the response is sent (successful calls only). */
export function attachActivityLogging(req, res, staff, rule) {
  if (!rule?.label) return;
  let captured;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    captured = body;
    return originalJson(body);
  };
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const { detail, amount } = describeResult(captured, req.body);
    recordStaffActivity({ staff, action: rule.label, detail, amount, req, status: res.statusCode });
  });
}
