/**
 * What a staff member is allowed to see about themselves and their shop. The
 * owner's own profile (email, bank, documents...) is never returned to staff.
 * Shaped like the owner profile fields the frontend guards read, plus the
 * staff-specific parts it needs to filter menus.
 */
export function toStaffProfile(staff) {
  return {
    _id: staff.ownerId,
    role: staff.ownerType,
    name: staff.name,
    shopName: staff.ownerName,
    // The account was already checked as approved and active before this runs.
    isVerified: true,
    isActive: true,
    applicationStatus: "approved",
    isStaff: true,
    staff: {
      id: staff.id,
      name: staff.name,
      jobTitle: staff.jobTitle,
      ownerType: staff.ownerType,
      ownerName: staff.ownerName,
      permissions: staff.permissions,
      access: staff.access,
    },
  };
}
