import { useState } from "react";
import { Lock } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import PageHeader from "@shared/components/ui/PageHeader";
import { useToast } from "@shared/components/ui/Toast";
import { rawSet, STORAGE_KEYS } from "@core/utils/storage";
import { useAuth } from "@core/context/AuthContext";
import { apiMessage, staffAuthApi } from "../staffApi";
import { MIN_PASSWORD } from "../components/passwordUtils";

/** A staff member's own page: who they are and a way to change their password. */
const StaffAccount = () => {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const staff = user?.staff;

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < MIN_PASSWORD) return showToast(`New password must be at least ${MIN_PASSWORD} characters`, "warning");
    if (form.newPassword !== form.confirm) return showToast("The two new passwords do not match", "warning");
    setSaving(true);
    try {
      const { data } = await staffAuthApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      // Changing the password signs out other devices; keep this one signed in.
      const key = role === "admin" ? STORAGE_KEYS.AUTH_ADMIN : STORAGE_KEYS.AUTH_SELLER;
      if (data.result?.token) rawSet(key, data.result.token);
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      showToast("Password changed", "success");
    } catch (error) {
      showToast(apiMessage(error, "Could not change the password"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title="My Account" description="Your login details and password." />

      <Card className="space-y-1 p-5">
        <p className="text-lg font-bold text-slate-900">{staff?.name || user?.name}</p>
        {staff?.jobTitle && <p className="text-sm text-slate-500">{staff.jobTitle}</p>}
        {staff?.ownerName && <p className="text-xs text-slate-400">Works at {staff.ownerName}</p>}
        {staff?.access?.modules?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {staff.access.modules.map((m) => (
              <span key={m} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{m}</span>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><Lock size={15} /> Change password</p>
          <Input label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          <Input label="New password" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} helperText={`At least ${MIN_PASSWORD} characters`} />
          <Input label="Repeat new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          <Button type="submit" isLoading={saving}>Change Password</Button>
        </form>
      </Card>
    </div>
  );
};

export default StaffAccount;
