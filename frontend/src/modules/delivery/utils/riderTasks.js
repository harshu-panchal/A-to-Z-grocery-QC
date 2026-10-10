/**
 * Rider "jobs" from the order-history API. One order can carry two jobs for
 * riders (the delivery, then later a return pickup), and the backend tags
 * each order with `riderTasks: [{ kind, state, label, at }]` for this rider.
 * These helpers flatten that into one row per job so every screen shows the
 * same status for the same job.
 */

/** [{ key, order, task }] — one row per job, newest first. */
export function toTaskRows(orders) {
  const rows = [];
  (orders || []).forEach((order) => {
    (order.riderTasks || []).forEach((task) => {
      rows.push({ key: `${order._id}-${task.kind}`, order, task });
    });
  });
  return rows.sort((a, b) => new Date(b.task.at || 0) - new Date(a.task.at || 0));
}

export const TASK_KIND_LABEL = { delivery: "Delivery", return: "Return pickup" };

/** Badge colours by job state. */
export const TASK_STATE_STYLE = {
  active: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export const taskEarnings = (order, task) =>
  task.kind === "return"
    ? order.returnDeliveryCommission || 0
    : order.paymentBreakdown?.riderPayoutTotal || order.riderEarnings || 0;
