import Setting from "../../models/setting.js";
import handleResponse from "../../utils/helper.js";
import { normalizeProductApprovalConfig } from "../../services/productModerationService.js";

function flattenForMongoSet(prefix, value, target) {
  if (value === undefined) return;

  const isPlainObject =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date);

  if (!isPlainObject) {
    target[prefix] = value;
    return;
  }

  const keys = Object.keys(value);
  if (!keys.length) {
    target[prefix] = value;
    return;
  }

  for (const key of keys) {
    flattenForMongoSet(`${prefix}.${key}`, value[key], target);
  }
}

export const getPlatformSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({});

    if (!settings) {
      settings = await Setting.create({});
    }

    const result = settings?.toObject?.() || settings || {};
    result.productApproval = normalizeProductApprovalConfig(result);

    return handleResponse(
      res,
      200,
      "Platform settings fetched successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const payload = { ...(req.body || {}) };
    // `_id` in $set made the update fail (500); timestamps are server-owned.
    for (const key of ["_id", "__v", "createdAt", "updatedAt"]) delete payload[key];
    const toSet = {};
    for (const [key, value] of Object.entries(payload)) {
      flattenForMongoSet(key, value, toSet);
    }

    // runValidators: the schema's min/max (e.g. fees >= 0) were skipped here,
    // so a negative fee could be saved through this endpoint.
    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: toSet },
      { new: true, upsert: true, runValidators: true },
    );

    const result = settings?.toObject?.() || settings || {};
    result.productApproval = normalizeProductApprovalConfig(result);

    return handleResponse(
      res,
      200,
      "Platform settings updated successfully",
      result,
    );
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      const message = error.errors
        ? Object.values(error.errors).map((e) => e.message).join(", ")
        : `Invalid value for ${error.path}`;
      return handleResponse(res, 400, message);
    }
    return handleResponse(res, 500, error.message);
  }
};
