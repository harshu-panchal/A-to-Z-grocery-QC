import Admin from "../../models/admin.js";
import handleResponse from "../../utils/helper.js";

export const getAdminProfile = async (req, res) => {
  try {
    if (!req.user?.id) {
      return handleResponse(res, 400, "Missing user ID in session");
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    return handleResponse(
      res,
      200,
      "Admin profile fetched successfully",
      admin,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateAdminProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    if (name) {
      admin.name = name;
    }

    if (email) {
      admin.email = email;
    }

    const updatedAdmin = await admin.save();

    return handleResponse(
      res,
      200,
      "Admin profile updated successfully",
      updatedAdmin,
    );
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "Email already in use");
    }

    return handleResponse(res, 500, error.message);
  }
};

export const updateAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.user.id).select("+password +tokenVersion");
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return handleResponse(res, 401, "Invalid current password");
    }

    admin.password = newPassword;
    // Audit fix H5: invalidate every token issued before this change —
    // verifyToken rejects any token whose tokenVersion doesn't match the
    // current DB value, so this immediately signs the admin out everywhere
    // except the session that just changed the password (which gets a
    // fresh token on next login).
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();

    return handleResponse(res, 200, "Password updated successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
