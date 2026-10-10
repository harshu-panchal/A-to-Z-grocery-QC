import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, PackageCheck, Truck, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deliveryApi } from "../services/deliveryApi";
import { getOrderSocket, onOrderStatusUpdate } from "@/core/services/orderSocket";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";
import { toTaskRows, TASK_KIND_LABEL, TASK_STATE_STYLE } from "../utils/riderTasks";

const fetchTasks = async (status) => {
  const res = await deliveryApi.getOrderHistory({ status });
  const list = res.data?.results ?? res.data?.result ?? [];
  return toTaskRows(Array.isArray(list) ? list : []);
};

const TaskRow = ({ row, onOpen }) => {
  const { order, task } = row;
  const Icon = task.kind === "return" ? Undo2 : Truck;
  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          task.state === "active" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
        )}
      >
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-gray-900">#{order.orderId}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {TASK_KIND_LABEL[task.kind]}
          </span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", TASK_STATE_STYLE[task.state])}>
            {task.label}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center text-xs font-bold text-primary">
        {task.state === "active" ? "Continue" : "View"}
        <ChevronRight size={14} aria-hidden="true" />
      </span>
    </button>
  );
};

/**
 * Rider home: jobs in progress (with Continue) and jobs finished today, so a
 * rider who leaves an order screen can always get back to it and can see at a
 * glance which orders are delivered and which are still on the way.
 */
const MyOrdersPanel = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = useState(false);

  const { data: active = [], isLoading } = useQuery({
    queryKey: ["delivery", "myTasks", "active"],
    queryFn: () => fetchTasks("active"),
    refetchInterval: 30000,
  });
  const { data: doneToday = [] } = useQuery({
    queryKey: ["delivery", "myTasks", "today"],
    queryFn: () => fetchTasks("today"),
    refetchInterval: 60000,
  });

  // any status change on one of my orders -> refresh both lists
  useEffect(() => {
    const getToken = createSocketTokenReader(STORAGE_KEYS.AUTH_DELIVERY);
    getOrderSocket(getToken);
    return onOrderStatusUpdate(getToken, () => {
      queryClient.invalidateQueries({ queryKey: ["delivery", "myTasks"] });
    });
  }, [queryClient]);

  const open = (order) => navigate(`/delivery/order-details/${encodeURIComponent(order.orderId)}`);

  if (isLoading) return null;
  if (!active.length && !doneToday.length) return null;

  return (
    <section aria-labelledby="my-orders-title" className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="my-orders-title" className="text-sm font-bold text-gray-900">My orders</h3>
        <div className="flex items-center gap-1.5 text-[11px] font-bold">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
            {active.length} in progress
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
            {doneToday.length} done today
          </span>
        </div>
      </div>

      {active.length > 0 ? (
        <div className="space-y-2">
          {active.map((row) => (
            <TaskRow key={row.key} row={row} onOpen={open} />
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-500">
          <PackageCheck size={15} className="text-emerald-500" aria-hidden="true" />
          No orders in progress. All caught up.
        </p>
      )}

      {doneToday.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center justify-between text-xs font-bold text-gray-600"
          >
            Completed today ({doneToday.length})
            <ChevronDown size={15} className={cn("transition-transform", showDone && "rotate-180")} aria-hidden="true" />
          </button>
          {showDone && (
            <div className="mt-2 space-y-2">
              {doneToday.map((row) => (
                <TaskRow key={row.key} row={row} onOpen={open} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default MyOrdersPanel;
