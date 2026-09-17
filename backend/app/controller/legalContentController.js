import Joi from "joi";
import LegalContent, {
  LEGAL_AUDIENCES,
  LEGAL_PAGE_TYPES,
} from "../models/legalContent.js";
import Setting from "../models/setting.js";
import handleResponse from "../utils/helper.js";
import { sanitizeLegalHtml } from "../utils/sanitizeLegalHtml.js";
import { buildDefaultLegalPages } from "../constants/legalContentDefaults.js";

const audienceParam = Joi.string()
  .valid(...LEGAL_AUDIENCES)
  .required();
const pageTypeParam = Joi.string()
  .valid(...LEGAL_PAGE_TYPES)
  .required();

const upsertSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  contentHtml: Joi.string().allow("").max(200000).required(),
}).unknown(false);

async function getBranding() {
  const settings = await Setting.findOne({})
    .select("appName companyName")
    .lean();
  return {
    appName: settings?.appName || "App",
    companyName: settings?.companyName || settings?.appName || "App",
  };
}

async function ensureDefaults() {
  const existing = await LegalContent.countDocuments();
  if (existing >= LEGAL_AUDIENCES.length * LEGAL_PAGE_TYPES.length) {
    return;
  }

  const branding = await getBranding();
  const defaults = buildDefaultLegalPages(branding);

  await Promise.all(
    defaults.map((doc) =>
      LegalContent.updateOne(
        { audience: doc.audience, pageType: doc.pageType },
        {
          $setOnInsert: {
            title: doc.title,
            contentHtml: sanitizeLegalHtml(doc.contentHtml),
          },
        },
        { upsert: true },
      ),
    ),
  );
}

async function ensureOne(audience, pageType) {
  let doc = await LegalContent.findOne({ audience, pageType }).lean();
  if (doc) return doc;

  await ensureDefaults();
  doc = await LegalContent.findOne({ audience, pageType }).lean();
  if (doc) return doc;

  const branding = await getBranding();
  const defaults = buildDefaultLegalPages(branding);
  const fallback = defaults.find(
    (d) => d.audience === audience && d.pageType === pageType,
  );

  if (!fallback) return null;

  const created = await LegalContent.findOneAndUpdate(
    { audience, pageType },
    {
      $setOnInsert: {
        title: fallback.title,
        contentHtml: sanitizeLegalHtml(fallback.contentHtml),
      },
    },
    { upsert: true, new: true, lean: true },
  );
  return created;
}

/** GET /api/admin/legal-pages */
export const listLegalPages = async (req, res) => {
  try {
    await ensureDefaults();
    const items = await LegalContent.find({})
      .sort({ audience: 1, pageType: 1 })
      .lean();
    return handleResponse(res, 200, "Legal pages fetched", { items });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** GET /api/admin/legal-pages/:audience/:pageType */
export const getAdminLegalPage = async (req, res) => {
  try {
    const { error, value } = Joi.object({
      audience: audienceParam,
      pageType: pageTypeParam,
    }).validate(req.params);
    if (error) return handleResponse(res, 400, error.details[0].message);

    const doc = await ensureOne(value.audience, value.pageType);
    if (!doc) return handleResponse(res, 404, "Legal page not found");
    return handleResponse(res, 200, "Legal page fetched", doc);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/** PUT /api/admin/legal-pages/:audience/:pageType */
export const upsertLegalPage = async (req, res) => {
  try {
    const params = Joi.object({
      audience: audienceParam,
      pageType: pageTypeParam,
    }).validate(req.params);
    if (params.error) {
      return handleResponse(res, 400, params.error.details[0].message);
    }

    const body = upsertSchema.validate(req.body || {});
    if (body.error) {
      return handleResponse(res, 400, body.error.details[0].message);
    }

    const { audience, pageType } = params.value;
    const title = body.value.title.trim();
    const contentHtml = sanitizeLegalHtml(body.value.contentHtml);

    const updated = await LegalContent.findOneAndUpdate(
      { audience, pageType },
      {
        $set: {
          title,
          contentHtml,
          updatedBy: req.user?.id || req.user?._id || null,
        },
      },
      { upsert: true, new: true, lean: true, setDefaultsOnInsert: true },
    );

    return handleResponse(res, 200, "Legal page saved", updated);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/** GET /api/legal-pages/:audience/:pageType (public) */
export const getPublicLegalPage = async (req, res) => {
  try {
    const { error, value } = Joi.object({
      audience: audienceParam,
      pageType: pageTypeParam,
    }).validate(req.params);
    if (error) return handleResponse(res, 400, error.details[0].message);

    const doc = await ensureOne(value.audience, value.pageType);
    if (!doc) return handleResponse(res, 404, "Legal page not found");

    return handleResponse(res, 200, "Legal page fetched", {
      audience: doc.audience,
      pageType: doc.pageType,
      title: doc.title,
      contentHtml: doc.contentHtml,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};
