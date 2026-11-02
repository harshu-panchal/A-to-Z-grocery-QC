import express from "express";
import { verifyToken, allowRoles, requireApprovedSeller } from "../middleware/authMiddleware.js";
import handleResponse from "../utils/helper.js";
import { listBrandsFor, createBrand, adminList, adminUpdate, adminMerge, adminDelete } from "../services/brandService.js";

const fail = (res, err) =>
  res.status(err.statusCode || 500).json({
    success: false,
    error: true,
    message: err.statusCode ? err.message : "Something went wrong",
    ...(err.suggestions ? { result: { suggestions: err.suggestions } } : {}),
  });
const who = (req) => ({ role: req.user.role === "admin" ? "admin" : "seller", userId: req.user.id, userName: req.staff?.name || "" });

/** /brands — the brand picker on the product form (sellers and admins) */
export const brandRouter = express.Router();
brandRouter.use(verifyToken, allowRoles("seller", "admin"), requireApprovedSeller);
brandRouter.get("/", async (req, res) => {
  try {
    return handleResponse(res, 200, "Brands", await listBrandsFor({ ...who(req), search: req.query.search }));
  } catch (err) {
    return fail(res, err);
  }
});
brandRouter.post("/", async (req, res) => {
  try {
    const { brand, existed } = await createBrand({ ...who(req), name: req.body?.name, force: req.body?.force === true });
    const msg = existed ? `"${brand.name}" is already in the list` : brand.status === "pending" ? `"${brand.name}" added. The admin will confirm it.` : `"${brand.name}" added`;
    return handleResponse(res, existed ? 200 : 201, msg, brand);
  } catch (err) {
    return fail(res, err);
  }
});

/** /admin/brands — manage the list: approve, rename, merge duplicates, delete unused */
export const adminBrandRouter = express.Router();
adminBrandRouter.use(verifyToken, allowRoles("admin"));
adminBrandRouter.get("/", async (req, res) => {
  try {
    return handleResponse(res, 200, "Brands", await adminList({ status: req.query.status, search: req.query.search }));
  } catch (err) {
    return fail(res, err);
  }
});
adminBrandRouter.patch("/:id", async (req, res) => {
  try {
    return handleResponse(res, 200, "Brand updated", await adminUpdate(req.params.id, req.body || {}));
  } catch (err) {
    return fail(res, err);
  }
});
adminBrandRouter.post("/:id/merge", async (req, res) => {
  try {
    const r = await adminMerge(req.params.id, req.body?.intoId);
    return handleResponse(res, 200, `Merged into "${r.into.name}" (${r.productsMoved} product(s) updated)`, r);
  } catch (err) {
    return fail(res, err);
  }
});
adminBrandRouter.delete("/:id", async (req, res) => {
  try {
    const r = await adminDelete(req.params.id);
    return handleResponse(res, 200, r.productsCleared ? `"${r.name}" deleted. ${r.productsCleared} product(s) are now Unbranded.` : `"${r.name}" deleted`, r);
  } catch (err) {
    return fail(res, err);
  }
});
