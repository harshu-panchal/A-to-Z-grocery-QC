import Seller from "../models/seller.js";
import Transaction from "../models/transaction.js";
import { handleResponse, calculateDistance } from "../utils/helper.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";
import { getSellerSidebarBadges } from "../services/sidebarBadgesService.js";
import { withLock } from "../utils/distributedLock.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";

// Cache key grid resolution: rounding to 2 decimal places (~1.1km at the
// equator) so nearby-but-distinct customer locations can share one cache
// entry without ever serving a genuinely different area's sellers.
const NEARBY_SELLERS_GRID_PRECISION = 2;

export const NEARBY_SELLERS_CACHE_PATTERN = buildKey("seller", "nearby", "*");

/* ===============================
   GET NEARBY SELLERS
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const customerLat = Number(lat);
    const customerLng = Number(lng);

    const gridLat = customerLat.toFixed(NEARBY_SELLERS_GRID_PRECISION);
    const gridLng = customerLng.toFixed(NEARBY_SELLERS_GRID_PRECISION);
    const cacheKey = buildKey("seller", "nearby", `${gridLat}:${gridLng}`);

    const nearbySellers = await getOrSet(
      cacheKey,
      async () => {
        // Fetch all active/verified sellers
        // We could use $geoNear, but to strictly follow the requirement of individual radii,
        // we'll fetch sellers within a reasonable max distance (e.g. 100km) and then filter.
        const sellers = await Seller.find({
          isActive: true,
          isVerified: true,
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [customerLng, customerLat],
              },
              $maxDistance: 100000, // 100km max search area for performance
            },
          },
        }).lean();

        // Filter based on individual service radius
        return sellers.filter((seller) => {
          const sellerLng = seller.location.coordinates[0];
          const sellerLat = seller.location.coordinates[1];
          const distance = calculateDistance(
            customerLat,
            customerLng,
            sellerLat,
            sellerLng,
          );

          // Add distance to seller object for frontend
          seller.distance = distance;

          return distance <= (seller.serviceRadius || 5);
        });
      },
      getTTL("nearbySellers"),
    );

    return handleResponse(
      res,
      200,
      "Nearby sellers fetched successfully",
      nearbySellers,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (Seller)
================================ */
export const requestWithdrawal = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0 || !Number.isFinite(Number(amount))) {
      return handleResponse(res, 400, "Please enter a valid amount");
    }

    const requestAmount = Number(amount);

    // Audit fix M2: the balance read and the withdrawal-transaction write
    // used to happen with no lock tying them together, so two concurrent
    // requests could both read the same available balance before either
    // write became visible to the other, letting a seller request
    // withdrawals exceeding their real available balance. Serialize the
    // whole read-check-write sequence per seller.
    const withdrawal = await withLock(
      `withdrawal:lock:seller:${sellerId}`,
      10_000,
      async () => {
        // 1. Calculate current available balance
        // Consistent with getSellerEarnings logic in sellerStatsController.js
        const transactions = await Transaction.find({
          user: sellerId,
          userModel: "Seller",
        })
          .select("status amount type")
          .lean();

        const settledBalance = transactions
          .filter((t) => t.status === "Settled")
          .reduce((acc, t) => acc + (t.amount || 0), 0);

        const pendingPayouts = transactions
          .filter(
            (t) =>
              t.type === "Withdrawal" &&
              (t.status === "Pending" || t.status === "Processing"),
          )
          .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0);

        const availableBalance = settledBalance - pendingPayouts;

        if (requestAmount > availableBalance) {
          const err = new Error(
            `Insufficient balance. Available: ₹${availableBalance}`,
          );
          err.statusCode = 400;
          throw err;
        }

        // 2. Create Withdrawal Transaction
        // Withdrawals have negative amounts per the model comment
        return Transaction.create({
          user: sellerId,
          userModel: "Seller",
          type: "Withdrawal",
          amount: -Math.abs(requestAmount),
          status: "Pending",
          reference: `WDR-${Date.now()}`,
        });
      },
    );

    return handleResponse(
      res,
      201,
      "Withdrawal request submitted successfully",
      withdrawal,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ===============================
   GET SELLER PROFILE
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    return handleResponse(
      res,
      200,
      "Seller profile fetched successfully",
      seller,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE SELLER PROFILE
================================ */
export const updateSellerProfile = async (req, res) => {
  try {
    const { name, shopName, phone, address, locality, pincode, city, state, lat, lng, radius } = req.body;

    // Find seller
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Update fields if provided
    if (name) seller.name = name;
    if (shopName) seller.shopName = shopName;
    if (phone) seller.phone = phone;
    if (address !== undefined) seller.address = address;
    if (locality !== undefined) seller.locality = locality;
    if (pincode !== undefined) seller.pincode = pincode;
    if (city !== undefined) seller.city = city;
    if (state !== undefined) seller.state = state;

    // Validate and update geo data
    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90)
        return handleResponse(res, 400, "Invalid latitude");
      if (lng < -180 || lng > 180)
        return handleResponse(res, 400, "Invalid longitude");

      seller.location = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }

    if (radius !== undefined) {
      if (radius < 1 || radius > 100)
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      seller.serviceRadius = Number(radius);
    }

    const updatedSeller = await seller.save();

    // Invalidate cached seller name in case shopName changed
    invalidateSellerName(req.user.id).catch((err) => {
      console.warn("[Seller] Name cache invalidation failed:", err.message);
    });

    // Location/radius changes affect the customer-facing nearby-sellers cache
    if ((lat !== undefined && lng !== undefined) || radius !== undefined) {
      invalidate(NEARBY_SELLERS_CACHE_PATTERN).catch((err) => {
        console.warn("[Seller] Nearby-sellers cache invalidation failed:", err.message);
      });
    }

    return handleResponse(
      res,
      200,
      "Profile updated successfully",
      updatedSeller,
    );
  } catch (error) {
    // Handle duplicate phone error
    if (error.code === 11000) {
      return handleResponse(res, 400, "Phone number already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   SIDEBAR BADGE COUNTS
================================ */
export const getSellerSidebarBadgesController = async (req, res) => {
  try {
    const badges = await getSellerSidebarBadges(req.user.id);
    return handleResponse(res, 200, "Sidebar badges fetched", badges);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
