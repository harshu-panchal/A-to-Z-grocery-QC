// Pure helpers for "which screens may this staff member open?". No app imports,
// so they can be unit tested on their own.

// Screens every staff member can open, whatever they were given.
export const ALWAYS_ALLOWED = ["/seller/my-account", "/admin/my-account", "/seller/about", "/seller/terms", "/seller/privacy"];

const under = (pathname, base) => pathname === base || pathname === `${base}/` || pathname.startsWith(`${base}/`);

/** Can a staff member with this `access` (from the server) open this URL? */
export function pathAllowed(access, pathname) {
  if (ALWAYS_ALLOWED.some((p) => under(pathname, p))) return true;
  return (access?.allowedPaths || []).some(({ path, exact }) =>
    exact ? pathname === path || pathname === `${path}/` : under(pathname, path),
  );
}

/** Keep only the menu entries a staff member may open (and their sub-menus). */
export function filterNavForStaff(items, access) {
  return (items || []).flatMap((item) => {
    if (item.children?.length) {
      const children = item.children.filter((c) => pathAllowed(access, c.path));
      return children.length ? [{ ...item, children }] : [];
    }
    return item.path && pathAllowed(access, item.path) ? [item] : [];
  });
}
