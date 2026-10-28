import { useEffect, useState } from "react";
import { Copy, Dices } from "lucide-react";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import { useToast } from "@shared/components/ui/Toast";
import { apiMessage } from "../staffApi";
import { MIN_PASSWORD, randomPassword } from "./passwordUtils";

/** The owner sets a new password for a staff member (it also signs them out). */
const ResetPasswordModal = ({ isOpen, onClose, api, member }) => {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setDone(false);
    }
  }, [isOpen]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      showToast("Password copied", "success");
    } catch {
      showToast("Copy didn't work. Select the password and copy it.", "warning");
    }
  };

  const submit = async () => {
    if (password.length < MIN_PASSWORD) return showToast(`Password must be at least ${MIN_PASSWORD} characters`, "warning");
    setSaving(true);
    try {
      await api.resetPassword(member.id, password);
      setDone(true);
      showToast("Password reset", "success");
    } catch (error) {
      showToast(apiMessage(error, "Could not reset the password"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title={`Reset password: ${member?.name || ""}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{done ? "Close" : "Cancel"}</Button>
          {!done && <Button onClick={submit} isLoading={saving}>Reset Password</Button>}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`New password (at least ${MIN_PASSWORD} characters)`}
            autoComplete="new-password"
            readOnly={done}
          />
          {!done && (
            <Button variant="outline" onClick={() => setPassword(randomPassword())}>
              <Dices size={16} className="mr-1.5" /> Generate
            </Button>
          )}
          {done && (
            <Button variant="outline" onClick={copy}>
              <Copy size={16} className="mr-1.5" /> Copy
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {done
            ? "Done. Share this password with them now: you can't see it again. They were signed out and any lock on their account is lifted."
            : "They will be signed out everywhere and must log in with the new password."}
        </p>
      </div>
    </Modal>
  );
};

export default ResetPasswordModal;
