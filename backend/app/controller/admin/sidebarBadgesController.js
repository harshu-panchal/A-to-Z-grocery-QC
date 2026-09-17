import handleResponse from "../../utils/helper.js";
import { getAdminSidebarBadges } from "../../services/sidebarBadgesService.js";

export const getAdminSidebarBadgesController = async (req, res) => {
  try {
    const badges = await getAdminSidebarBadges();
    return handleResponse(res, 200, "Sidebar badges fetched", badges);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
