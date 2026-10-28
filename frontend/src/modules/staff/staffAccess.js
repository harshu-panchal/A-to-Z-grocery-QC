import { useMemo } from "react";
import { useAuth } from "@core/context/AuthContext";
import { pathAllowed, filterNavForStaff } from "./staffPaths";

export { pathAllowed, filterNavForStaff };

const RANK = { view: 1, edit: 2 };

/**
 * What the signed-in person may do. Owners (seller / admin) can do everything,
 * so every check answers true for them; only staff accounts are limited.
 */
export function useStaffAccess() {
  const { user } = useAuth();
  return useMemo(() => {
    const isStaff = Boolean(user?.isStaff);
    const staff = user?.staff || null;
    const access = staff?.access || null;
    const permissions = staff?.permissions || {};
    return {
      isStaff,
      staff,
      access,
      landing: access?.landing || null,
      posOnly: Boolean(access?.posOnly),
      /** may this URL be opened? */
      canOpen: (pathname) => !isStaff || pathAllowed(access, pathname),
      /** do they hold this permission at this level? (key like "orders.orders") */
      can: (key, level = "view") => !isStaff || (RANK[permissions[key]] || 0) >= (RANK[level] || 1),
      /** a single on/off switch such as "pos.cost" */
      special: (key) => !isStaff || Boolean(access?.specials?.[key]),
    };
  }, [user]);
}
