import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { apiMessage, staffAuthApi } from "../staffApi";

/** One login page for every staff member, whichever shop or panel they work in. */
const StaffLogin = () => {
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || "";

  const submit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return toast.error("Enter your phone or email and your password");
    setLoading(true);
    try {
      const { data } = await staffAuthApi.login({ identifier: identifier.trim(), password });
      const result = data.result;
      // Staff work inside their owner's panel, so the session is stored there.
      login(result);
      toast.success(`Welcome, ${result.name}`);
      navigate(result.staff?.access?.landing || `/${result.role}`, { replace: true });
    } catch (error) {
      toast.error(apiMessage(error, "Could not log in"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[700px] w-[700px] rounded-full bg-primary/10 opacity-40 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-lg sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={appName} className="h-14 w-14 rounded-xl object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-black text-white">{appName.charAt(0)}</div>
          )}
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Staff Login</h1>
            <p className="mt-1 text-sm text-slate-400">Sign in with the phone or email and password your manager gave you.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone or email</span>
            <span className="relative block">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoFocus
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                placeholder="9876543210"
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Password</span>
            <span className="relative block">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm font-semibold outline-none transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                placeholder="Your password"
              />
              <button
                type="button"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-primary text-sm font-bold text-white shadow-md shadow-primary/20 transition-all hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Forgot your password? Ask your manager to reset it.
          <br />
          Shop owner or admin?{" "}
          <Link to="/seller/auth" className="font-semibold text-primary hover:underline">Seller login</Link>
          {" · "}
          <Link to="/admin/auth" className="font-semibold text-primary hover:underline">Admin login</Link>
        </p>
      </div>
    </div>
  );
};

export default StaffLogin;
