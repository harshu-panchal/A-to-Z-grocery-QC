import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@shared/components/ui/PageHeader";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import axiosInstance from "@core/api/axios";
import { cn } from "@/lib/utils";

const KEY = ["admin", "brands"];
const msg = (err, fallback) => err.response?.data?.message || fallback;
// lists come back as `results` (a single item as `result`)
const listOf = (res) => res.data?.results || res.data?.result || [];

/**
 * Brand list sellers pick from on the product form. Approve sellers' new
 * brands, fix a name (all its products follow), merge duplicates
 * ("amul" / "Amull" -> "Amul"), delete brands nobody uses.
 */
export default function BrandManagement() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [merging, setMerging] = useState(null);

  useEffect(() => { const t = setTimeout(() => setTerm(search), 300); return () => clearTimeout(t); }, [search]);
  const { data: brands = [], isLoading } = useQuery({
    queryKey: [...KEY, status, term],
    queryFn: async () => listOf(await axiosInstance.get("/admin/brands", { params: { status, search: term } })),
  });
  const { data: all = [] } = useQuery({
    queryKey: [...KEY, "all"],
    queryFn: async () => listOf(await axiosInstance.get("/admin/brands")),
  });
  const pendingCount = all.filter((b) => b.status === "pending").length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const approve = async (b) => {
    try {
      await axiosInstance.patch(`/admin/brands/${b._id}`, { status: "approved" });
      toast.success(`"${b.name}" approved`);
      refresh();
    } catch (err) { toast.error(msg(err, "Could not approve")); }
  };
  const remove = async (b) => {
    const note = b.productCount
      ? `\n\n${b.productCount} product(s) use it. They will become "Unbranded" (or use "Merge into…" to move them to another brand instead).`
      : "";
    if (!window.confirm(`Delete brand "${b.name}"?${note}`)) return;
    try {
      const r = await axiosInstance.delete(`/admin/brands/${b._id}`);
      toast.success(r.data?.message || "Brand deleted");
      refresh();
    } catch (err) { toast.error(msg(err, "Could not delete")); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Brands" description="Add brands here; sellers choose from this list when adding products. A brand a seller adds waits here for your approval." />

      <AddBrand onDone={refresh} />

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {[["", "All"], ["pending", `Waiting for approval${pendingCount ? ` (${pendingCount})` : ""}`], ["approved", "Approved"]].map(([v, label]) => (
            <button key={v} type="button" onClick={() => setStatus(v)} className={cn("rounded-lg px-3 py-1.5", status === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{label}</button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brand" className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary" />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="p-3">Brand</th><th className="p-3">Status</th><th className="p-3">Added by</th><th className="p-3 text-right">Products</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Loading…</td></tr>}
            {!isLoading && !brands.length && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No brands here.</td></tr>}
            {brands.map((b) => (
              <tr key={b._id} className="border-t border-slate-100">
                <td className="p-3 font-semibold text-slate-800">{b.name}</td>
                <td className="p-3"><Badge variant={b.status === "pending" ? "warning" : "success"}>{b.status === "pending" ? "waiting" : "approved"}</Badge></td>
                <td className="p-3 text-xs text-slate-500">{b.requestedBy?.role ? `${b.requestedBy.role}${b.requestedBy.name ? ` · ${b.requestedBy.name}` : ""}` : "existing products"}</td>
                <td className="p-3 text-right">{b.productCount}</td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {b.status === "pending" && <Button size="sm" onClick={() => approve(b)}>Approve</Button>}
                    <Button size="sm" variant="outline" onClick={() => setRenaming(b)}>Rename</Button>
                    <Button size="sm" variant="outline" onClick={() => setMerging(b)}>Merge into…</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => remove(b)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <RenameModal brand={renaming} onClose={() => setRenaming(null)} onDone={refresh} />
      <MergeModal brand={merging} brands={all} onClose={() => setMerging(null)} onDone={refresh} />
    </div>
  );
}

function RenameModal({ brand, onClose, onDone }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(brand?.name || ""); }, [brand]);
  const save = async () => {
    setBusy(true);
    try {
      await axiosInstance.patch(`/admin/brands/${brand._id}`, { name });
      toast.success("Brand renamed. Its products were updated.");
      onDone();
      onClose();
    } catch (err) { toast.error(msg(err, "Could not rename")); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={Boolean(brand)} onClose={onClose} title={`Rename "${brand?.name || ""}"`}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={busy}>Save</Button></div>}>
      <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary" />
      <p className="mt-2 text-xs text-slate-500">All {brand?.productCount || 0} product(s) with this brand will show the new name.</p>
    </Modal>
  );
}

function MergeModal({ brand, brands, onClose, onDone }) {
  const [intoId, setIntoId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setIntoId(""); }, [brand]);
  const options = brands.filter((b) => b._id !== brand?._id);
  const save = async () => {
    setBusy(true);
    try {
      const r = await axiosInstance.post(`/admin/brands/${brand._id}/merge`, { intoId });
      toast.success(r.data?.message || "Merged");
      onDone();
      onClose();
    } catch (err) { toast.error(msg(err, "Could not merge")); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={Boolean(brand)} onClose={onClose} title={`Merge "${brand?.name || ""}" into…`}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={busy} disabled={!intoId}>Merge</Button></div>}>
      <select value={intoId} onChange={(e) => setIntoId(e.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary">
        <option value="">Choose the correct brand</option>
        {options.map((b) => <option key={b._id} value={b._id}>{b.name}{b.status === "pending" ? " (waiting)" : ""}</option>)}
      </select>
      <p className="mt-2 text-xs text-slate-500">Its {brand?.productCount || 0} product(s) move to the chosen brand, and "{brand?.name}" is removed.</p>
    </Modal>
  );
}

/** Admin adds a brand: approved straight away; a lookalike asks "Did you mean ...?" first. */
function AddBrand({ onDone }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState(null);
  const add = async (force = false) => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await axiosInstance.post("/brands", { name, force });
      toast.success(r.data?.message || "Brand added");
      setName("");
      setSuggest(null);
      onDone();
    } catch (err) {
      const suggestions = err.response?.status === 409 ? err.response?.data?.result?.suggestions : null;
      if (suggestions?.length) setSuggest(suggestions);
      else toast.error(msg(err, "Could not add the brand"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-2 p-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add(false); }}>
        <input value={name} onChange={(e) => { setName(e.target.value); setSuggest(null); }} placeholder="New brand name, e.g. Amul" maxLength={60}
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary" />
        <Button type="submit" isLoading={busy} disabled={!name.trim()}>Add brand</Button>
      </form>
      {suggest && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="font-semibold">Already in the list:</span>
          {suggest.map((b) => <span key={b._id} className="rounded bg-white px-2 py-0.5 font-bold">{b.name}</span>)}
          <button type="button" onClick={() => add(true)} className="ml-auto text-xs font-bold underline">Add "{name.trim()}" anyway</button>
        </div>
      )}
    </Card>
  );
}
