import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Mail,
  Phone,
  Store,
  Shield,
  Edit2,
  Save,
  X,
  Rocket,
  Globe,
  MapPin,
} from "lucide-react";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import MapPicker from "../../../shared/components/MapPicker";

const PROFILE_QUERY_KEY = ["seller", "profile"];

const SellerProfile = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    shopName: "",
    phone: "",
    email: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
  });

  // Perf audit Phase 8: migrated to React Query. `profile` is read-only
  // display data straight from the cache; `formData` is editable local
  // state seeded from it once per successful fetch (seededRef guard, same
  // pattern as AdminProfile/AdminSettings) so a background refetch can't
  // clobber in-progress edits. The ref is reset after a save or a status
  // toggle so the next fetched value re-seeds the form.
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
      const response = await sellerApi.getProfile();
      return response.data.result;
    },
  });

  useEffect(() => {
    if (isError) toast.error("Failed to fetch profile");
  }, [isError]);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!profile || seededRef.current) return;
    seededRef.current = true;
    setFormData({
      name: profile.name,
      shopName: profile.shopName,
      phone: profile.phone,
      email: profile.email,
      lat: profile.location?.coordinates[1] || null,
      lng: profile.location?.coordinates[0] || null,
      radius: profile.serviceRadius || 5,
      address: profile.address || "",
    });
  }, [profile]);

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Disallow numbers in seller name
      const cleaned = value.replace(/[0-9]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Allow only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "email") {
      // Trim spaces, keep as-is otherwise; HTML5 type=email will help validate shape
      setFormData({ ...formData, [name]: value.trimStart() });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Basic phone validation: must be exactly 10 digits
    if (!/^[0-9]{10}$/.test(formData.phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
    // Basic email validation
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        lat: formData.lat,
        lng: formData.lng,
        radius: formData.radius,
      };
      await sellerApi.updateProfile(payload);
      toast.success("Profile updated successfully");
      setIsEditing(false);
      seededRef.current = false;
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const newStatus = !profile.isActive;
      await sellerApi.updateProfile({ isActive: newStatus });
      queryClient.setQueryData(PROFILE_QUERY_KEY, (prev) => ({ ...prev, isActive: newStatus }));
      toast.success(`Shop is now ${newStatus ? "Active" : "Inactive"}`);
    } catch (error) {
      toast.error("Failed to update shop status");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header Section */}
      <div className="relative mb-20 px-4">
        {/* Banner Background */}
        <div className="relative h-52 overflow-hidden rounded-xl bg-gradient-to-r from-slate-900 via-slate-950 to-black shadow-lg">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute -left-1/2 -top-1/2 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-1/2 -right-1/2 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          </div>
        </div>

        {/* Profile Info Row */}
        <div className="absolute bottom-6 left-4 right-4 grid grid-cols-1 items-center gap-5 md:left-8 md:right-8 md:grid-cols-[144px_minmax(0,1fr)_auto] md:items-end lg:left-12 lg:right-12">
          {/* Avatar Container */}
          <div className="mx-auto h-36 w-36 flex-shrink-0 rounded-full bg-white p-2 shadow-lg md:mx-0">
            <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-slate-50 bg-slate-50">
              <span className="text-5xl font-black text-slate-900">
                {profile?.name?.charAt(0)}
              </span>
            </div>
          </div>

          {/* Info Block */}
          <div className="min-w-0 pb-2 text-center md:pb-4 md:text-left">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-xl">
                {profile?.role}
              </span>
              <button
                onClick={toggleStatus}
                className={`group flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${
                  profile?.isActive
                    ? "border-success/40 bg-success text-white"
                    : "border-danger/40 bg-danger text-white"
                }`}>
                <div
                  className={`h-2 w-2 animate-pulse rounded-full ${
                    profile?.isActive ? "bg-white" : "bg-white"
                  }`}
                />
                {profile?.isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <h1 className="mb-1 break-words text-3xl font-black tracking-tight text-white drop-shadow-sm md:text-4xl lg:text-5xl">
              {profile?.name}
            </h1>
            <p className="text-lg font-bold tracking-tight text-white/60">
              {profile?.shopName}
            </p>
          </div>

          {/* Action Button */}
          <div className="w-full pb-2 md:w-auto md:pb-4">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/20 bg-white/10 px-6 py-3 text-xs font-bold tracking-widest text-white shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] hover:bg-white hover:text-slate-950 active:scale-95 md:w-auto lg:px-10">
                <Edit2 size={16} /> Edit Profile
              </Button>
            ) : (
              <div className="flex w-full justify-center gap-3 md:w-auto md:justify-end">
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white hover:text-slate-900">
                  <X size={20} />
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="flex h-12 min-w-0 max-w-full items-center gap-2 whitespace-nowrap rounded-lg bg-white px-6 text-xs font-bold tracking-widest text-slate-950 shadow-lg hover:bg-slate-100 lg:px-10">
                  {isSaving ? (
                    "Updating..."
                  ) : (
                    <>
                      <Save size={16} /> Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Main Info Card */}
        <div className="space-y-5 md:col-span-2">
          <Card className="p-6">
            <h3 className="mb-6 border-b border-slate-50 pb-4 text-lg font-black text-slate-900">
              Business Profile
            </h3>

            <form className="space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                    Seller Identity
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      name="name"
                      maxLength={50}
                      pattern="[a-zA-Z\s]*"
                      value={formData.name}
                      onChange={(e) => {
                          e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                          handleChange(e);
                      }}
                      disabled={!isEditing}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                    Store Name
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300">
                      <Store size={16} />
                    </div>
                    <input
                      type="text"
                      name="shopName"
                      value={formData.shopName}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                    Contact Number
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300">
                      <Phone size={16} />
                    </div>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300">
                      <Mail size={16} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:opacity-70"
                    />
                  </div>
                </div>
              </div>
            </form>
          </Card>

          {/* Location & Radius Settings Card */}
          <Card className="p-6">
            <div className="mb-6 flex items-center justify-between border-b border-slate-50 pb-4">
              <h3 className="text-lg font-black text-slate-900">
                Location & Service Settings
              </h3>
              {!isEditing && (
                <Button onClick={() => setIsEditing(true)} size="sm">
                  Manage
                </Button>
              )}
            </div>

            <div className="space-y-5">
              <div className="space-y-5 rounded-xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                        formData.lat
                          ? "bg-success/10 text-success"
                          : "bg-white text-slate-400 shadow-sm"
                      }`}>
                      <MapPin size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">
                        {formData.lat
                          ? "Store Location Pin"
                          : "Location Not Defined"}
                      </p>
                      <p className="max-w-[400px] text-xs font-medium leading-relaxed text-slate-500">
                        {formData.address ||
                          "Click change to precisely mark your shop location on the map for delivery accuracy."}
                      </p>
                    </div>
                  </div>
                  {isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMapOpen(true)}
                      className="whitespace-nowrap"
                    >
                      Change Pin
                    </Button>
                  )}
                </div>

                {formData.lat && (
                  <div className="flex flex-wrap gap-6 border-t border-slate-200/60 pt-5">
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Service Radius
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">
                          {formData.radius}
                        </span>
                        <span className="rounded-md bg-slate-200/50 px-2 py-0.5 text-xs font-bold text-slate-500">
                          KM
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Latitude
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-700">
                        {formData.lat.toFixed(6)}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Longitude
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-700">
                        {formData.lng.toFixed(6)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4">
                <Shield size={16} className="mt-0.5 text-warning" />
                <p className="text-xs font-medium leading-relaxed text-warning/90">
                  Your shop location and service radius determine which
                  customers can view your products. Ensure the marker is placed
                  exactly at your physical storefront for accurate delivery
                  assignments.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar Card */}
        <div className="space-y-5">
          <Card className="border-none bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-6 text-white">
            <h4 className="mb-5 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Security & Trust
            </h4>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <Shield size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/60">
                    Verification
                  </p>
                  <p className="text-sm font-bold">
                    {profile?.isVerified
                      ? "Verified Merchant"
                      : "Verification Pending"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <Rocket size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/60">
                    Partner Tier
                  </p>
                  <p className="text-sm font-bold">Standard Growth</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <Globe size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/60">
                    Region
                  </p>
                  <p className="text-sm font-bold">Pan India Reach</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Legal &amp; Support
          </h3>
          <div className="flex flex-wrap gap-3 text-sm font-bold">
            <a href="/seller/support" className="text-primary hover:underline">
              Support
            </a>
            <span className="text-slate-300">·</span>
            <a href="/seller/terms" className="text-slate-700 hover:underline">
              Terms
            </a>
            <span className="text-slate-300">·</span>
            <a href="/seller/privacy" className="text-slate-700 hover:underline">
              Privacy
            </a>
            <span className="text-slate-300">·</span>
            <a href="/seller/about" className="text-slate-700 hover:underline">
              About
            </a>
          </div>
        </Card>
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          initialLocation={
            formData.lat ? { lat: formData.lat, lng: formData.lng } : null
          }
          initialRadius={formData.radius}
        />
      )}
    </div>
  );
};

export default SellerProfile;
