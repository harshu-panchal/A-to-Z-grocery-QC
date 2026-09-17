import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import {
    User,
    Lock,
    Shield,
    Mail,
    Camera,
    LogOut,
    Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@core/context/AuthContext';
import { adminApi } from '../services/adminApi';

const AdminProfile = () => {
    const { user, logout } = useAuth();
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('profile');
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        role: 'Admin'
    });

    const [security, setSecurity] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    // Perf audit Phase 8: migrated the profile fetch to React Query. The
    // result seeds editable local form state, so a background refetch
    // (window refocus, etc.) must not clobber in-progress edits — the
    // seededRef guard applies fetched data into form state only once,
    // and is intentionally reset after a successful save so the
    // post-save refresh (matching the original's fetchProfile() call
    // after update) re-seeds from the server's response.
    const profileQueryKey = ['admin', 'profile'];
    const { data: profileData, isLoading, isError } = useQuery({
        queryKey: profileQueryKey,
        queryFn: async () => {
            const response = await adminApi.getProfile();
            const data = response.data.result;
            return {
                name: data.name,
                email: data.email,
                role: data.role || 'Admin',
            };
        },
    });

    useEffect(() => {
        if (isError) toast.error('Failed to fetch admin profile');
    }, [isError]);

    const seededRef = useRef(false);
    useEffect(() => {
        if (!profileData || seededRef.current) return;
        seededRef.current = true;
        setProfile(profileData);
    }, [profileData]);

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await adminApi.updateProfile({
                name: profile.name,
                email: profile.email
            });
            toast.success('Profile updated successfully');
            seededRef.current = false;
            queryClient.invalidateQueries({ queryKey: profileQueryKey });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (security.newPassword !== security.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        setIsSaving(true);
        try {
            await adminApi.updatePassword({
                currentPassword: security.currentPassword,
                newPassword: security.newPassword
            });
            toast.success('Password updated successfully');
            setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update password');
        } finally {
            setIsSaving(false);
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
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        My Profile
                        <div className="rounded-lg bg-primary/10 p-1.5">
                            <User className="h-4 w-4 text-primary" />
                        </div>
                    </span>
                }
                description="Manage your account settings and security preferences."
                actions={
                    <Button variant="outline" onClick={logout}>
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Sidebar / User Card */}
                <div className="space-y-5 lg:col-span-4">
                    <Card className="overflow-hidden p-0">
                        <div className="flex flex-col items-center p-6 text-center">
                            <div className="group relative cursor-pointer">
                                <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-slate-50 bg-slate-100">
                                    <span className="text-3xl font-black text-slate-300">
                                        {profile.name?.charAt(0)}
                                    </span>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Camera className="h-7 w-7 text-white" />
                                </div>
                            </div>
                            <h2 className="mt-5 text-xl font-black text-slate-900">{profile.name}</h2>
                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary">
                                <Shield className="h-3 w-3" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{profile.role}</span>
                            </div>
                        </div>
                        <div className="bg-slate-50/50 p-2">
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={cn(
                                    "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
                                    activeTab === 'profile'
                                        ? "border border-slate-100 bg-white text-primary shadow-sm"
                                        : "text-slate-400 hover:bg-slate-100/50 hover:text-slate-600"
                                )}
                            >
                                <User className="h-4 w-4" />
                                Profile Information
                            </button>
                            <button
                                onClick={() => setActiveTab('security')}
                                className={cn(
                                    "mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
                                    activeTab === 'security'
                                        ? "border border-slate-100 bg-white text-primary shadow-sm"
                                        : "text-slate-400 hover:bg-slate-100/50 hover:text-slate-600"
                                )}
                            >
                                <Lock className="h-4 w-4" />
                                Security & Password
                            </button>
                        </div>
                    </Card>
                </div>

                {/* Content Area */}
                <div className="space-y-5 lg:col-span-8">

                    {/* Profile Information Tab */}
                    {activeTab === 'profile' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    Edit Profile
                                </h3>
                            </div>
                            <form onSubmit={handleProfileUpdate} className="space-y-5 p-6">
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Full Name</label>
                                        <input
                                            type="text"
                                            value={profile.name}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="email"
                                                value={profile.email}
                                                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end border-t border-slate-50 pt-5">
                                    <Button type="submit" isLoading={isSaving}>
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    )}

                    {/* Security Tab */}
                    {activeTab === 'security' && (
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                                    Change Password
                                </h3>
                            </div>
                            <form onSubmit={handlePasswordUpdate} className="space-y-5 p-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Password</label>
                                    <div className="relative">
                                        <Key className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="password"
                                            value={security.currentPassword}
                                            onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                                            className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">New Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                                            <input
                                                type="password"
                                                value={security.newPassword}
                                                onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Confirm New Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                                            <input
                                                type="password"
                                                value={security.confirmPassword}
                                                onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                                                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end border-t border-slate-50 pt-5">
                                    <Button type="submit" isLoading={isSaving}>
                                        {isSaving ? 'Updating...' : 'Update Password'}
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminProfile;
