import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dices, Eye, EyeOff } from "lucide-react";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { apiMessage } from "../staffApi";
import PermissionPicker from "./PermissionPicker";
import { MIN_PASSWORD, randomPassword } from "./passwordUtils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_HOURS = { enabled: false, start: "09:00", end: "21:00", days: [0, 1, 2, 3, 4, 5, 6] };

const blank = (initial) => ({
  name: "",
  jobTitle: initial?.jobTitle || "",
  phone: "",
  email: "",
  password: "",
  permissions: { ...(initial?.permissions || {}) },
  typeId: initial?.typeId || null,
  workingHours: { ...DEFAULT_HOURS },
  saveAsType: false,
  typeName: "",
});

const fromMember = (m) => ({
  name: m.name,
  jobTitle: m.jobTitle || "",
  phone: m.phone || "",
  email: m.email || "",
  password: "",
  permissions: { ...(m.permissions || {}) },
  typeId: m.typeId || null,
  workingHours: { ...DEFAULT_HOURS, ...(m.workingHours || {}) },
  saveAsType: false,
  typeName: "",
});

/**
 * Add a staff member, or edit one. `initial` pre-fills a new person from a
 * quick button (job title + permissions); `member` switches to edit mode.
 */
const StaffFormModal = ({ isOpen, onClose, api, portal, catalog, initial, member }) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const editing = Boolean(member);
  const [form, setForm] = useState(() => (member ? fromMember(member) : blank(initial)));
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Start fresh every time the form opens.
  useEffect(() => {
    if (isOpen) {
      setForm(member ? fromMember(member) : blank(initial));
      setShowPassword(false);
    }
  }, [isOpen, member, initial]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setHours = (patch) => setForm((prev) => ({ ...prev, workingHours: { ...prev.workingHours, ...patch } }));
  const toggleDay = (d) => {
    const days = form.workingHours.days.includes(d) ? form.workingHours.days.filter((x) => x !== d) : [...form.workingHours.days, d];
    setHours({ days: days.sort() });
  };

  const validate = () => {
    if (!form.name.trim()) return "Enter their name";
    if (!form.phone.trim() && !form.email.trim()) return "Enter a phone number or an email so they can log in";
    if (!editing && form.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
    const hasSection = (catalog?.modules || []).some((m) => m.subs.some((s) => !s.special && form.permissions[s.key]));
    if (!hasSection) return "Pick at least one section this person can open";
    if (form.saveAsType && !(form.typeName.trim() || form.jobTitle.trim())) return "Give the new quick button a name";
    if (form.workingHours.enabled && form.workingHours.days.length === 0) return "Pick at least one working day";
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) return showToast(problem, "warning");
    setSaving(true);
    try {
      let typeId = form.typeId;
      if (!editing && form.saveAsType) {
        const type = await api.createType({ name: form.typeName.trim() || form.jobTitle.trim(), permissions: form.permissions });
        typeId = (type.data.result || {}).id || null;
      }
      const body = {
        name: form.name.trim(),
        jobTitle: form.jobTitle.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        permissions: form.permissions,
        workingHours: form.workingHours,
        typeId,
      };
      if (editing) await api.updateMember(member.id, body);
      else await api.createMember({ ...body, password: form.password });
      showToast(editing ? "Staff member updated" : "Staff member added", "success");
      await queryClient.invalidateQueries({ queryKey: ["staff", portal] });
      onClose();
    } catch (error) {
      showToast(apiMessage(error, "Could not save"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      size="lg"
      title={editing ? `Edit ${member.name}` : form.jobTitle ? `Add ${form.jobTitle}` : "Add Staff Member"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} isLoading={saving}>{editing ? "Save Changes" : "Add Staff Member"}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Full name *" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Ravi Kumar" maxLength={80} />
          <Input label="Job title" value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="e.g. Cashier" maxLength={60} />
          <Input label="Phone (login id)" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="10-digit mobile number" inputMode="numeric" />
          <Input label="Email (optional login id)" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" type="email" />
        </div>

        {!editing && (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Password *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={form.password}
                  onChange={(e) => set({ password: e.target.value })}
                  type={showPassword ? "text" : "password"}
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Button variant="outline" onClick={() => { set({ password: randomPassword() }); setShowPassword(true); }}>
                <Dices size={16} className="mr-1.5" /> Generate
              </Button>
            </div>
            <p className="text-xs text-slate-500">They log in with this phone or email and this password. Share it with them; you can reset it later but not read it again.</p>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.workingHours.enabled} onChange={(e) => setHours({ enabled: e.target.checked })} />
            Only allow login during working hours
          </label>
          {form.workingHours.enabled && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input type="time" value={form.workingHours.start} onChange={(e) => setHours({ start: e.target.value })} className="h-9 rounded-md border border-slate-200 px-2" />
                <span className="text-slate-400">to</span>
                <input type="time" value={form.workingHours.end} onChange={(e) => setHours({ end: e.target.value })} className="h-9 rounded-md border border-slate-200 px-2" />
                <span className="text-xs text-slate-400">(India time; a shift past midnight works too)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={form.workingHours.days.includes(i)}
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-bold transition-all",
                      form.workingHours.days.includes(i) ? "border-primary bg-primary text-white" : "border-slate-200 bg-slate-50 text-slate-500",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-800">What can they open?</p>
          <PermissionPicker modules={catalog?.modules || []} value={form.permissions} onChange={(permissions) => set({ permissions })} />
        </div>

        {!editing && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.saveAsType} onChange={(e) => set({ saveAsType: e.target.checked })} />
              Save these permissions as a quick button
            </label>
            {form.saveAsType && (
              <Input
                value={form.typeName}
                onChange={(e) => set({ typeName: e.target.value })}
                placeholder={form.jobTitle || "Name of the quick button, e.g. Night Cashier"}
                maxLength={60}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default StaffFormModal;
