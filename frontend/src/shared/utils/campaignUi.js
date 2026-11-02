// Display helpers shared by the admin, seller and customer campaign screens.

export const PHASE_META = {
  draft: { label: 'Draft', variant: 'secondary' },
  inviting: { label: 'Inviting sellers', variant: 'info' },
  live: { label: 'Live', variant: 'success' },
  paused: { label: 'Paused', variant: 'warning' },
  ended: { label: 'Ended', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

/** Date -> value for <input type="datetime-local"> in the viewer's timezone. */
export const toLocalInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

/** "2d 4h", "3h 12m", "12m" until `d`; "" once passed. */
export const timeLeft = (d, now = Date.now()) => {
  const ms = new Date(d).getTime() - now;
  if (!(ms > 0)) return '';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${Math.max(1, mins)}m`;
};

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
