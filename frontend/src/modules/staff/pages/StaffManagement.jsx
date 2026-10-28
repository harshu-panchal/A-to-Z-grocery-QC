import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import EmptyState from "@shared/components/ui/EmptyState";
import ConfirmDialog from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { apiMessage, makeStaffApi } from "../staffApi";
import StaffFormModal from "../components/StaffFormModal";
import StaffTypeModal from "../components/StaffTypeModal";
import ResetPasswordModal from "../components/ResetPasswordModal";
import ActivityLog from "../components/ActivityLog";

const MAX_CHIPS = 4;

const lastSeen = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "Never";

const QuickButton = ({ label, description, onClick, onEdit, onDelete }) => (
  <div className="group relative">
    <button
      type="button"
      onClick={onClick}
      title={description}
      className={cn(
        "flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-primary/50 hover:text-primary",
        onEdit && "pr-14",
      )}
    >
      <UserPlus size={15} className="text-primary" />
      {label}
    </button>
    {onEdit && (
      <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
        <button type="button" aria-label={`Edit ${label}`} onClick={onEdit} className="rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={13} /></button>
        <button type="button" aria-label={`Delete ${label}`} onClick={onDelete} className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"><X size={13} /></button>
      </span>
    )}
  </div>
);

/**
 * Staff Management for the seller (their shop's staff) and the admin team.
 * portal: "seller" | "admin".
 */
const StaffManagement = ({ portal }) => {
  const api = useMemo(() => makeStaffApi(portal), [portal]);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [tab, setTab] = useState("members");
  const [formState, setFormState] = useState({ open: false, member: null, initial: null });
  const [typeState, setTypeState] = useState({ open: false, type: null });
  const [resetFor, setResetFor] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: "member" | "type", item }

  const catalogQuery = useQuery({
    queryKey: ["staff", portal, "catalog"],
    queryFn: async () => (await api.catalog()).data.result,
  });
  const membersQuery = useQuery({
    queryKey: ["staff", portal, "members"],
    queryFn: async () => (await api.members()).data.results || [],
  });

  const catalog = catalogQuery.data;
  const members = membersQuery.data || [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff", portal] });

  const openAdd = (initial = null) => setFormState({ open: true, member: null, initial });
  const openEdit = (member) => setFormState({ open: true, member, initial: null });
  const closeForm = () => setFormState((s) => ({ ...s, open: false }));

  const toggleActive = async (m) => {
    try {
      await api.updateMember(m.id, { isActive: !m.isActive });
      showToast(m.isActive ? `${m.name} switched off. They were signed out.` : `${m.name} switched on`, "success");
      refresh();
    } catch (error) {
      showToast(apiMessage(error), "error");
    }
  };

  const doDelete = async () => {
    const { kind, item } = confirm;
    setConfirm(null);
    try {
      if (kind === "member") await api.removeMember(item.id);
      else await api.removeType(item.id);
      showToast(kind === "member" ? "Staff member removed" : "Quick button deleted", "success");
      refresh();
    } catch (error) {
      showToast(apiMessage(error), "error");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff Management"
        description={
          portal === "seller"
            ? "Give your team their own logins and choose exactly what each person can open."
            : "Add your admin team and choose exactly which sections each person can use."
        }
      />

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add a staff member</p>
          {catalog?.limits && <p className="text-[11px] text-slate-400">{members.length} of {catalog.limits.maxStaff} used</p>}
        </div>
        {catalogQuery.isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : catalogQuery.isError ? (
          <p className="text-sm text-red-500">Could not load the staff options. Refresh the page.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(catalog?.presets || []).map((p) => (
              <QuickButton key={p.key} label={p.label} description={p.description} onClick={() => openAdd({ jobTitle: p.label, permissions: p.permissions })} />
            ))}
            {(catalog?.types || []).map((t) => (
              <QuickButton
                key={t.id}
                label={t.name}
                description="Your own quick button"
                onClick={() => openAdd({ jobTitle: t.name, permissions: t.permissions, typeId: t.id })}
                onEdit={() => setTypeState({ open: true, type: t })}
                onDelete={() => setConfirm({ kind: "type", item: t })}
              />
            ))}
            <button
              type="button"
              onClick={() => setTypeState({ open: true, type: null })}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-primary/50 px-3.5 py-2 text-sm font-bold text-primary hover:bg-primary/5"
            >
              <Plus size={15} /> New Staff Type
            </button>
            <Button onClick={() => openAdd()} disabled={!catalog}>
              <UserPlus size={15} className="mr-1.5" /> Add Custom Staff
            </Button>
          </div>
        )}
      </Card>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {[
          { id: "members", label: "Staff Members", count: members.length },
          { id: "activity", label: "Activity Log" },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "members" ? (
        membersQuery.isLoading ? (
          <p className="p-8 text-center text-sm text-slate-400">Loading staff…</p>
        ) : membersQuery.isError ? (
          <p className="p-8 text-center text-sm text-red-500">Could not load your staff. Refresh the page.</p>
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No staff yet"
            description="Pick a quick button above, for example Cashier, to give someone their own login."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Can open</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className={cn(!m.isActive && "bg-slate-50/60")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", m.isActive ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-400")}>
                          {m.name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{m.name}</p>
                          <p className="truncate text-xs text-slate-400">{m.phone || m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.jobTitle ? <Badge variant="secondary">{m.jobTitle}</Badge> : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[280px] flex-wrap gap-1">
                        {m.modules.slice(0, MAX_CHIPS).map((x) => (
                          <span key={x} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{x}</span>
                        ))}
                        {m.modules.length > MAX_CHIPS && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">+{m.modules.length - MAX_CHIPS}</span>}
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">Last login: {lastSeen(m.lastLoginAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={m.isActive}
                          aria-label={`${m.name} is ${m.isActive ? "on" : "off"}`}
                          onClick={() => toggleActive(m)}
                          className={cn("relative h-5 w-9 rounded-full transition-colors", m.isActive ? "bg-primary" : "bg-slate-300")}
                        >
                          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", m.isActive ? "left-[18px]" : "left-0.5")} />
                        </button>
                        {m.lockedUntil && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600"><Lock size={10} /> Locked</span>
                        )}
                        {m.workingHours?.enabled && <span className="text-[10px] text-slate-400">{m.workingHours.start}–{m.workingHours.end}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" aria-label={`Edit ${m.name}`} title="Edit" onClick={() => openEdit(m)} className="rounded-lg p-2 text-slate-400 hover:bg-primary/10 hover:text-primary"><Pencil size={15} /></button>
                        <button type="button" aria-label={`Reset password for ${m.name}`} title="Reset password" onClick={() => setResetFor(m)} className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600"><KeyRound size={15} /></button>
                        <button type="button" aria-label={`Remove ${m.name}`} title="Remove" onClick={() => setConfirm({ kind: "member", item: m })} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <ActivityLog api={api} portal={portal} members={members} />
      )}

      <StaffFormModal isOpen={formState.open} onClose={closeForm} api={api} portal={portal} catalog={catalog} initial={formState.initial} member={formState.member} />
      <StaffTypeModal isOpen={typeState.open} onClose={() => setTypeState((s) => ({ ...s, open: false }))} api={api} portal={portal} catalog={catalog} type={typeState.type} />
      <ResetPasswordModal isOpen={Boolean(resetFor)} onClose={() => setResetFor(null)} api={api} member={resetFor} />
      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title={confirm?.kind === "member" ? "Remove staff member?" : "Delete quick button?"}
        message={
          confirm?.kind === "member"
            ? `${confirm?.item?.name} will no longer be able to log in. Their past activity stays in the log.`
            : `"${confirm?.item?.name}" will disappear from the buttons. People already added from it keep their access.`
        }
        confirmLabel={confirm?.kind === "member" ? "Remove" : "Delete"}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

export default StaffManagement;
