import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import { useToast } from "@shared/components/ui/Toast";
import { apiMessage } from "../staffApi";
import PermissionPicker from "./PermissionPicker";

/** Create or edit one of the owner's own quick buttons ("Night Cashier"). */
const StaffTypeModal = ({ isOpen, onClose, api, portal, catalog, type }) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const editing = Boolean(type);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(type?.name || "");
      setPermissions({ ...(type?.permissions || {}) });
    }
  }, [isOpen, type]);

  const submit = async () => {
    if (!name.trim()) return showToast("Give the staff type a name", "warning");
    const hasSection = (catalog?.modules || []).some((m) => m.subs.some((s) => !s.special && permissions[s.key]));
    if (!hasSection) return showToast("Pick at least one section for this staff type", "warning");
    setSaving(true);
    try {
      if (editing) await api.updateType(type.id, { name: name.trim(), permissions });
      else await api.createType({ name: name.trim(), permissions });
      showToast(editing ? "Staff type updated" : "Quick button created", "success");
      await queryClient.invalidateQueries({ queryKey: ["staff", portal, "catalog"] });
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
      title={editing ? "Edit Quick Button" : "New Staff Type"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} isLoading={saving}>{editing ? "Save Changes" : "Create Button"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night Cashier, Returns Desk" maxLength={60} />
        <PermissionPicker modules={catalog?.modules || []} value={permissions} onChange={setPermissions} />
        <p className="text-xs text-slate-500">
          This becomes a button next to the ready-made ones. It only pre-fills the Add Staff form: people you already added keep their own access.
        </p>
      </div>
    </Modal>
  );
};

export default StaffTypeModal;
