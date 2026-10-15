import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import { sendApplicationRejectionEmail } from "../../services/emailService.js";

export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified } = req.query;
    const query = {};

    if (status === "online") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
      // Exclude rejected applicants — they are unverified but no longer pending review
      query.applicationStatus = { $ne: "rejected" };
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const [deliveryPartners, total] = await Promise.all([
      Delivery.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: deliveryPartners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!reason || !reason.trim()) {
      return handleResponse(res, 400, "Rejection reason is required");
    }

    const rider = await Delivery.findByIdAndUpdate(
      id,
      { applicationStatus: "rejected", rejectionReason: reason.trim(), isVerified: false },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    sendApplicationRejectionEmail({
      email: rider.email,
      name: rider.name || "Applicant",
      reason: reason.trim(),
      type: "delivery",
    }).catch(() => {});

    return handleResponse(res, 200, "Rider application rejected");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

const VEHICLE_TYPES = ["bike", "scooter", "cycle"];

// Pull the editable rider fields out of a request body, validating as we go.
function readRiderFields(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has("name")) {
    const name = String(body.name || "").trim();
    if (!/^[a-zA-Z\s.]{2,60}$/.test(name)) throw new Error("Enter a valid name (letters and spaces only)");
    out.name = name;
  }
  if (!partial || has("phone")) {
    const phone = String(body.phone || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Mobile number must be 10 digits starting with 6-9");
    out.phone = phone;
  }
  if (has("email")) out.email = String(body.email || "").trim().toLowerCase();
  if (!partial || has("vehicleType")) {
    const v = String(body.vehicleType || "bike").toLowerCase();
    if (!VEHICLE_TYPES.includes(v)) throw new Error("Vehicle must be bike, scooter or cycle");
    out.vehicleType = v;
  }
  if (has("vehicleNumber")) out.vehicleNumber = String(body.vehicleNumber || "").trim().toUpperCase();
  if (has("currentArea")) out.currentArea = String(body.currentArea || "").trim();
  return out;
}

/** Admin adds a rider directly; they can log in with OTP on their number right away. */
export const createDeliveryPartner = async (req, res) => {
  try {
    let fields;
    try { fields = readRiderFields(req.body); } catch (e) { return handleResponse(res, 400, e.message); }
    if (await Delivery.exists({ phone: fields.phone })) {
      return handleResponse(res, 409, "A rider with this mobile number already exists");
    }
    const rider = await Delivery.create({
      ...fields,
      isVerified: true,
      applicationStatus: "approved",
      isOnline: false,
    });
    return handleResponse(res, 201, "Rider added", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliveryPartner = async (req, res) => {
  try {
    let fields;
    try { fields = readRiderFields(req.body, { partial: true }); } catch (e) { return handleResponse(res, 400, e.message); }
    if (fields.phone && (await Delivery.exists({ phone: fields.phone, _id: { $ne: req.params.id } }))) {
      return handleResponse(res, 409, "Another rider already uses this mobile number");
    }
    const rider = await Delivery.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
    if (!rider) return handleResponse(res, 404, "Rider not found");
    return handleResponse(res, 200, "Rider updated", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Takes a rider off the platform: offline, unverified, and login is refused. */
export const deactivateDeliveryPartner = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim() || "Deactivated by admin";
    const rider = await Delivery.findByIdAndUpdate(
      req.params.id,
      { isVerified: false, isOnline: false, applicationStatus: "rejected", rejectionReason: reason },
      { new: true },
    );
    if (!rider) return handleResponse(res, 404, "Rider not found");
    return handleResponse(res, 200, "Rider deactivated", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: {
        $in: ["confirmed", "packed", "shipped", "out_for_delivery"],
      },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => ({
      id: order.orderId,
      status:
        order.status === "out_for_delivery"
          ? "On the Way"
          : order.status === "packed"
            ? "At Pickup"
            : order.status === "shipped"
              ? "In Transit"
              : "Assigned",
      deliveryBoy: {
        name: order.deliveryBoy?.name || "Unknown",
        phone: order.deliveryBoy?.phone || "N/A",
        id: order.deliveryBoy?._id || "N/A",
        vehicle: order.deliveryBoy?.vehicleType || "N/A",
        image:
          order.deliveryBoy?.documents?.profileImage ||
          "https://via.placeholder.com/200",
      },
      seller: {
        name: order.seller?.shopName || order.seller?.name || "Unknown",
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
      lastUpdate: order.updatedAt,
    }));

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
