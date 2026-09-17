import Joi from "joi";
import Setting from "../../models/setting.js";
import handleResponse from "../../utils/helper.js";
import { invalidateProviderCache } from "../../services/storage/storageService.js";

const updateStorageSettingsSchema = Joi.object({
  provider: Joi.string().valid("cloudinary", "local").required(),
}).unknown(false);

/**
 * GET /api/admin/settings/storage (admin only)
 * Returns the current media storage provider for NEW uploads. Defaults
 * to "cloudinary" if no Setting document exists yet — existing
 * deployments keep working with zero manual DB changes.
 */
export const getStorageSettings = async (req, res) => {
  try {
    const setting = await Setting.findOne({}).select("mediaStorage").lean();
    const provider = setting?.mediaStorage?.provider || "cloudinary";
    return handleResponse(res, 200, "Storage settings fetched successfully", { provider });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * PUT /api/admin/settings/storage (admin only)
 * Switches the provider used for NEW uploads only. Existing media is
 * never migrated or deleted as a side effect of this call.
 */
export const updateStorageSettings = async (req, res) => {
  try {
    const { error, value } = updateStorageSettingsSchema.validate(req.body || {});
    if (error) {
      return handleResponse(res, 400, error.details.map((d) => d.message).join("; "));
    }

    await Setting.findOneAndUpdate(
      {},
      { $set: { "mediaStorage.provider": value.provider } },
      { new: true, upsert: true },
    );
    await invalidateProviderCache();

    return handleResponse(res, 200, "Storage settings updated successfully", { provider: value.provider });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
