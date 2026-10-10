/**
 * Rider range rules, shared by broadcasts, the available-orders list and the
 * accept endpoints so they always agree.
 *
 * - Delivery: the rider must be within the order's current delivery search
 *   radius of the store (starts at INITIAL_DELIVERY_RADIUS_METERS and grows by
 *   DELIVERY_RADIUS_MULTIPLIER on each retry).
 * - Return pickup: the rider must be within the return search radius of the
 *   customer (INITIAL_RETURN_PICKUP_RADIUS_METERS, grows by
 *   RETURN_PICKUP_RADIUS_MULTIPLIER).
 *
 * DEV_IGNORE_RIDER_RANGE=true switches the checks off for local testing with
 * far-away riders. It used to be implied by NODE_ENV !== "production", which
 * made every local run send orders to every online rider.
 */
import Delivery from "../../models/delivery.js";
import { distanceMeters } from "../../utils/geoUtils.js";

export const ignoreRiderRange = () => process.env.DEV_IGNORE_RIDER_RANGE === "true";

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const initialDeliveryRadiusM = () => num(process.env.INITIAL_DELIVERY_RADIUS_METERS, 5000);
export const initialReturnRadiusM = () => num(process.env.INITIAL_RETURN_PICKUP_RADIUS_METERS, 5000);

/** Largest radius a delivery search can grow to (after the last retry). */
export const maxDeliverySearchRadiusM = () => {
  const mult = num(process.env.DELIVERY_RADIUS_MULTIPLIER, 1.5);
  const attempts = num(process.env.DELIVERY_SEARCH_MAX_ATTEMPTS, 3);
  return Math.min(Math.round(initialDeliveryRadiusM() * mult ** Math.max(attempts - 1, 0)), 100_000);
};

export const deliverySearchRadiusM = (order) =>
  num(order?.deliverySearchMeta?.radiusMeters, initialDeliveryRadiusM());
export const returnSearchRadiusM = (order) =>
  num(order?.returnSearchMeta?.radiusMeters, initialReturnRadiusM());

/** {lat, lng} from a GeoJSON point or a {lat,lng}/{latitude,longitude} object. */
export function toLatLng(loc) {
  if (!loc) return null;
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates.map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
  }
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Throws (statusCode 403) unless the rider's last known location is within
 * `radiusM` of `target`. Skipped when the target has no coordinates (cannot
 * judge) or when DEV_IGNORE_RIDER_RANGE is on.
 */
export async function assertRiderWithinRange(riderId, target, radiusM, placeLabel) {
  if (ignoreRiderRange()) return;
  const point = toLatLng(target);
  if (!point) return;
  const rider = await Delivery.findById(riderId).select("location").lean();
  const me = toLatLng(rider?.location);
  if (!me) {
    const err = new Error("Turn on your location so we can check you are near this order.");
    err.statusCode = 403;
    throw err;
  }
  const d = distanceMeters(me.lat, me.lng, point.lat, point.lng);
  if (d > radiusM) {
    const err = new Error(
      `You are ${(d / 1000).toFixed(1)} km from the ${placeLabel}. Only partners within ${(radiusM / 1000).toFixed(1)} km can accept this order.`,
    );
    err.statusCode = 403;
    throw err;
  }
}
