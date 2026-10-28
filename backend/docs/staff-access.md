# Staff accounts

Sellers and the admin team can give people their own logins ("staff") with limited access.
Owners (seller / admin) always have full access; only staff are limited.

## How a request is checked

1. A staff login (`POST /api/staff/login`, phone or email + password) returns a JWT
   `{ id: <staff id>, role: "staff", tokenVersion }`.
2. `verifyToken` (and `optionalVerifyToken`) see `role: "staff"` and call
   `services/staff/staffAccess.js → resolveStaffRequest`, which:
   - loads the staff record and the owner (seller must be approved and active), rejecting a
     switched-off / deleted staff member, a stale `tokenVersion`, or login outside working hours;
   - finds the rule for this call in `services/staff/permissionRules.js`;
   - allows it only if the staff member holds the permission at the needed level;
   - then sets `req.user = { id: <owner id>, role: "seller" | "admin", isStaff: true }` so every
     existing handler keeps working "as the owner", and `req.staff` for who really acted.
3. Successful writes are recorded in `StaffActivity` (the Activity Log).

## Default deny

**A staff member can only call an endpoint that has a rule.** Adding a new API endpoint does not
open it to staff. To open one, add a line to `permissionRules.js` (`SELLER_RULES` / `ADMIN_RULES`):

```js
rule("PUT", "/seller/something/:id", "orders.orders", "Updated something"),
//     method   path                  permission        label shown in the Activity Log
```

- `need` can be a key (`"orders.orders"`), a module wildcard (`"orders.*"`), an array (any one), or `SELF`.
- Level is `view` for GET and `edit` otherwise (override with the 5th argument).
- Put specific paths above general ones: the first match wins.

Owner-only features (Staff Management, owner profile / password, system settings, the notification
inbox) have no rule on purpose, so staff are refused.

## Adding a permission

Edit `services/staff/permissionCatalog.js` (modules → sub-modules, each with the screen URLs it opens).
The Staff Management screens read this catalog from the API, so nothing else needs to change.
Then give the endpoints behind that screen rules, and add the screen to the front-end menu.

## Guard tests

`__tests__/staff-permissions.test.js` fails if

- a rule asks for a permission that does not exist,
- a POS route has no rule,
- an API call made by the admin or seller screens (read from the front-end API clients) has no rule
  and is not on the explicit owner-only list.

So a new screen cannot ship silently broken for staff.

## Other notes

- Passwords are bcrypt hashed. Five wrong passwords lock the account for 15 minutes; the owner
  resetting the password lifts the lock and signs the person out everywhere.
- POS bills record which staff member made them (`createdBy`, `createdByName`). Staff without the
  `pos.cost` switch never receive purchase rates or profit: every POS response is scrubbed
  (`services/staff/redactCost.js`).
- Staff do not get live socket updates (their token joins no rooms); order screens poll instead.
- Env: `STAFF_TOKEN_TTL` (default `12h`), `STAFF_MAX_PER_OWNER` (default `30`),
  `STAFF_TIMEZONE` (default `Asia/Kolkata`, used for working hours).
