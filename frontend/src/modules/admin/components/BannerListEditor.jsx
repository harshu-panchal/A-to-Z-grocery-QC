import { useRef } from "react";
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";
import BannerLinkPicker from "./BannerLinkPicker";
import { IMAGE_TYPES, MAX_BANNERS, MAX_IMAGE_BYTES, newBanner } from "./bannerEditorUtils";

const FIELD =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

/**
 * Banner list for the admin forms. `onChange` receives an updater function
 * (like React's setState), so uploads that finish later never overwrite edits
 * made in the meantime.
 */
const BannerListEditor = ({ items, onChange }) => {
  const { showToast } = useToast();
  const fileInputs = useRef({});

  const update = (key, changes) =>
    onChange((prev) => prev.map((b) => (b.key === key ? { ...b, ...changes } : b)));

  const move = (index, direction) =>
    onChange((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (key) => onChange((prev) => prev.filter((b) => b.key !== key));
  const add = () => onChange((prev) => (prev.length >= MAX_BANNERS ? prev : [...prev, newBanner()]));

  const upload = async (key, file) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      showToast("Use a JPG, PNG, WebP, GIF or AVIF image", "warning");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("Image is larger than 5 MB. Choose a smaller file.", "warning");
      return;
    }
    update(key, { isUploading: true });
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await adminApi.uploadExperienceBanner(fd);
      const url = res.data?.result?.url || res.data?.url;
      if (!url) throw new Error("Upload failed");
      update(key, { imageUrl: url, isUploading: false });
    } catch (e) {
      update(key, { isUploading: false });
      showToast(e.response?.data?.message || "Failed to upload banner image", "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Banners ({items.length}/{MAX_BANNERS})
        </label>
        <button
          type="button"
          onClick={add}
          disabled={items.length >= MAX_BANNERS}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          <HiOutlinePlus className="h-3.5 w-3.5" />
          Add banner
        </button>
      </div>

      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
          No banners yet. Click &quot;Add banner&quot; to upload one.
        </p>
      )}

      {items.map((item, idx) => {
        const hidden = item.status === "inactive";
        return (
          <div
            key={item.key}
            className={cn(
              "rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-opacity",
              hidden && "opacity-60",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Banner {idx + 1}
                {hidden && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">Hidden from customers</span>}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move banner up"
                  className="rounded-lg border border-slate-200 p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <HiOutlineChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move banner down"
                  className="rounded-lg border border-slate-200 p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <HiOutlineChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  aria-label="Remove banner"
                  className="rounded-lg p-1.5 text-slate-300 transition-all hover:bg-danger/10 hover:text-danger"
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div>
                <input
                  ref={(el) => { fileInputs.current[item.key] = el; }}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    upload(item.key, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputs.current[item.key]?.click()}
                  disabled={item.isUploading}
                  className="group relative flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-primary/50"
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title || `Banner ${idx + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-[10px] font-bold">
                      <HiOutlinePhoto className="h-6 w-6" />
                      Upload image
                    </span>
                  )}
                  {item.imageUrl && !item.isUploading && (
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-[10px] font-bold text-white group-hover:flex">
                      Change image
                    </span>
                  )}
                  {item.isUploading && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-[10px] font-bold text-slate-600">
                      Uploading…
                    </span>
                  )}
                </button>
                <p className="mt-1 text-[10px] text-slate-400">Wide 2:1 images (e.g. 1648×794) look best. JPG, PNG or WebP, up to 5 MB.</p>
              </div>

              <div className="min-w-0 space-y-2">
                <input
                  value={item.title}
                  maxLength={80}
                  onChange={(e) => update(item.key, { title: e.target.value })}
                  className={FIELD}
                  placeholder="Title shown on the banner (optional)"
                />
                <input
                  value={item.subtitle}
                  maxLength={160}
                  onChange={(e) => update(item.key, { subtitle: e.target.value })}
                  className={FIELD}
                  placeholder="Subtitle (optional)"
                />
                <BannerLinkPicker
                  linkType={item.linkType || "none"}
                  linkValue={item.linkValue || ""}
                  onChange={(link) => update(item.key, link)}
                />
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={(e) => update(item.key, { status: e.target.checked ? "active" : "inactive" })}
                  />
                  Show this banner to customers
                </label>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BannerListEditor;
