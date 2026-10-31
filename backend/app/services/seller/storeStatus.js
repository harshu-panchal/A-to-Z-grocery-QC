import Seller from "../../models/seller.js";

/**
 * Is a shop taking orders right now, and what to tell the customer.
 *
 * The seller's Open/Closed switch decides (plus vacation dates). Business
 * hours and working days do not open or close the shop by themselves; they
 * are shown to customers ("Opens 10:00 AM", "Accepting orders until 10:30 PM").
 * Times are India time.
 */

export const STORE_FIELDS = "shopName storeOpen businessHours workingDays vacation";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CLOSING_SOON_MIN = 60;

const IST_OFFSET_MIN = 330;
const istParts = (date) => {
  const d = new Date(date.getTime() + IST_OFFSET_MIN * 60000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dateKey: d.toISOString().slice(0, 10) };
};
const toMinutes = (hhmm) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const formatTime = (hhmm) => {
  const min = toMinutes(hhmm);
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const istDateLabel = (date) =>
  new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function vacationActive(seller, now) {
  const v = seller.vacation || {};
  if (!v.enabled) return false;
  const today = istParts(now).dateKey;
  const from = v.from ? istParts(new Date(v.from)).dateKey : null;
  const to = v.to ? istParts(new Date(v.to)).dateKey : null;
  return (!from || today >= from) && (!to || today <= to);
}

/** Next opening by the shop's hours/days, e.g. "Opens 10:00 AM", "Opens tomorrow 10:00 AM", "Opens Mon 10:00 AM". */
function nextOpening(seller, now) {
  const openMin = toMinutes(seller.businessHours?.open);
  if (openMin == null) return "";
  const days = Array.isArray(seller.workingDays) && seller.workingDays.length ? seller.workingDays : [0, 1, 2, 3, 4, 5, 6];
  const { day, minutes } = istParts(now);
  for (let i = 0; i < 8; i += 1) {
    const d = (day + i) % 7;
    if (!days.includes(d)) continue;
    if (i === 0 && minutes >= openMin) continue;
    const when = i === 0 ? "" : i === 1 ? "tomorrow " : `${DAY_NAMES[d]} `;
    return `Opens ${when}${formatTime(seller.businessHours.open)}`;
  }
  return "";
}

/** Minutes until today's closing time (handles overnight hours), or null. */
function minutesToClose(seller, now) {
  const openMin = toMinutes(seller.businessHours?.open);
  const closeMin = toMinutes(seller.businessHours?.close);
  if (closeMin == null) return null;
  const days = Array.isArray(seller.workingDays) && seller.workingDays.length ? seller.workingDays : [0, 1, 2, 3, 4, 5, 6];
  const { day, minutes } = istParts(now);
  const overnight = openMin != null && closeMin <= openMin;
  if (!overnight) return days.includes(day) && minutes < closeMin ? closeMin - minutes : null;
  // e.g. 6 PM - 2 AM: before 2 AM counts as yesterday's shift
  if (minutes < closeMin) return days.includes((day + 6) % 7) ? closeMin - minutes : null;
  return days.includes(day) ? 24 * 60 - minutes + closeMin : null;
}

export function computeStoreStatus(seller, now = new Date()) {
  if (!seller) return { isOpen: true };
  if (vacationActive(seller, now)) {
    const v = seller.vacation || {};
    return {
      isOpen: false,
      reason: "vacation",
      message: String(v.message || "").trim() || (v.to ? `Closed until ${istDateLabel(v.to)}` : "Closed for now"),
    };
  }
  if (seller.storeOpen === false) {
    return { isOpen: false, reason: "closed", message: nextOpening(seller, now) || "Closed now" };
  }
  const left = minutesToClose(seller, now);
  return {
    isOpen: true,
    closingSoon: left != null && left > 0 && left <= CLOSING_SOON_MIN
      ? `Accepting orders until ${formatTime(seller.businessHours.close)}`
      : "",
  };
}

/** { sellerId: status } for many shops (one query). */
export async function getStoreStatusMap(sellerIds) {
  const ids = [...new Set((sellerIds || []).filter(Boolean).map(String))];
  if (!ids.length) return {};
  const sellers = await Seller.find({ _id: { $in: ids } }).select(STORE_FIELDS).lean();
  const now = new Date();
  return Object.fromEntries(sellers.map((s) => [String(s._id), { ...computeStoreStatus(s, now), shopName: s.shopName }]));
}

/** Adds `store` ({ isOpen, message, closingSoon }) to each product, from its seller. */
export async function attachStoreStatus(products) {
  const list = Array.isArray(products) ? products : [];
  const sellerOf = (p) => String(p?.sellerId?._id || p?.sellerId || "");
  const map = await getStoreStatusMap(list.map(sellerOf));
  return list.map((p) => {
    const st = map[sellerOf(p)];
    return st ? { ...p, store: { isOpen: st.isOpen, message: st.message || "", closingSoon: st.closingSoon || "" } } : p;
  });
}
