import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, Camera, Save, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@core/context/AuthContext';
import { customerApi } from '../services/customerApi';
import axiosInstance from '@core/api/axios';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const EditProfilePage = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        bio: user?.bio || ''
    });

    const fileRef = useRef(null);
    const [photoUploading, setPhotoUploading] = useState(false);

    // Photo saves on its own (no need to press Save Changes)
    const handlePhotoPick = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) return toast.error('Please choose an image');
        if (file.size > MAX_PHOTO_BYTES) return toast.error('Image must be under 5 MB');
        setPhotoUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const up = await axiosInstance.post('/media/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            const url = up.data?.result?.url || up.data?.result?.secureUrl;
            if (!url) throw new Error('Upload failed');
            const res = await customerApi.updateProfile({ profileImage: url });
            login({ ...user, ...(res.data?.result || {}), profileImage: url });
            toast.success('Profile photo updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not upload photo');
        } finally {
            setPhotoUploading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await customerApi.updateProfile(formData);
            const updatedUser = response.data.result;

            // Update local auth state
            login({ ...user, ...updatedUser });

            toast.success('Profile updated successfully!');
            navigate('/profile');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-10">
            {/* Header */}
            <div className="atz-page-header sticky top-0 z-30 px-4 py-3 flex items-center gap-3">
                <Link to="/profile" className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                    <ArrowLeft size={24} className="text-slate-600" />
                </Link>
                <h1 className="text-lg font-black text-slate-800">Edit Profile</h1>
            </div>

            <div className="max-w-xl mx-auto p-5">

                {/* Profile Picture Upload */}
                <div className="flex flex-col items-center mb-8">
                    <div className="relative">
                        <div className="h-28 w-28 rounded-full bg-slate-200 border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                            {user?.profileImage
                                ? <img src={user.profileImage} alt="Profile" className="h-full w-full object-cover" />
                                : <User size={48} className="text-slate-400" />}
                            {photoUploading && (
                                <div className="absolute inset-0 m-1 flex items-center justify-center rounded-full bg-black/40">
                                    <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            aria-label="Change photo"
                            disabled={photoUploading}
                            onClick={() => fileRef.current?.click()}
                            className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full border-2 border-white shadow-sm hover:bg-[#0a701a] transition-colors disabled:opacity-60"
                        >
                            <Camera size={18} />
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
                    </div>
                    <button type="button" disabled={photoUploading} onClick={() => fileRef.current?.click()} className="mt-3 text-sm font-bold text-primary disabled:opacity-60">
                        {photoUploading ? 'Uploading…' : 'Change Photo'}
                    </button>
                </div>

                {/* Edit Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                                <User size={20} className="text-slate-400" />
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
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter your name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phone Number</label>
                            {/* the registered number is permanent: shown, never editable */}
                            <div className="flex items-center gap-3 bg-slate-100 px-4 py-3 rounded-xl border border-slate-200">
                                <Phone size={20} className="text-slate-400" />
                                <input
                                    type="tel"
                                    value={user?.phone || ''}
                                    readOnly
                                    disabled
                                    aria-readonly="true"
                                    className="bg-transparent w-full text-slate-500 font-bold outline-none cursor-not-allowed"
                                />
                                <Lock size={16} className="text-slate-400 shrink-0" />
                            </div>
                            <p className="mt-1.5 text-xs text-slate-400">Your registered number can't be changed.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                                <Mail size={20} className="text-slate-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter email address"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bio</label>
                            <textarea
                                name="bio"
                                value={formData.bio}
                                onChange={handleChange}
                                rows="3"
                                className="w-full bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-800 font-medium resize-none"
                                placeholder="Tell us about yourself..."
                            ></textarea>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-lg shadow-brand-200 hover:bg-[#0a701a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={20} />
                        )}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default EditProfilePage;

