import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { useSettings } from '@core/context/SettingsContext';
import { UserRole } from '@core/constants/roles';
import {
    Mail,
    Lock,
    User,
    ShieldCheck,
    ArrowRight,
    Eye,
    EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import Lottie from 'lottie-react';
import { adminApi } from '../services/adminApi';

const AdminAuth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login, isAuthenticated, role } = useAuth();
    const { settings } = useSettings();
    const navigate = useNavigate();

    React.useEffect(() => {
        import('@core/auth/activeRoleStore').then(({ setActiveRole, ROLES }) => {
            setActiveRole(ROLES.ADMIN);
        });
    }, []);

    // Perf audit FE-B6: dynamically loaded instead of statically imported.
    const [backendAnimation, setBackendAnimation] = useState(null);
    React.useEffect(() => {
        import('../../../assets/Backend Icon.json')
            .then((m) => setBackendAnimation(m.default))
            .catch(() => {});
    }, []);

    React.useEffect(() => {
        if (isAuthenticated && role === 'admin') {
            navigate('/admin', { replace: true });
        }
    }, [isAuthenticated, role, navigate]);
    const appName = settings?.appName || 'App';
    const logoUrl = settings?.logoUrl || '';

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        adminCode: '',
        phone: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        // Debug logging
        console.log('=== FRONTEND LOGIN ATTEMPT ===');
        console.log('Email:', formData.email);
        console.log('Password:', formData.password);
        console.log('Password Length:', formData.password?.length);
        console.log('Is Login:', isLogin);
        console.log('==============================');

        // Only validate password complexity for signup, not login
        if (!isLogin) {
            const pwd = (formData.password || '').trim();
            if (pwd.length < 10) {
                toast.error('Password must be at least 10 characters long.');
                setIsLoading(false);
                return;
            }
            if (!/[a-z]/.test(pwd)) {
                toast.error('Password must contain at least one lowercase letter.');
                setIsLoading(false);
                return;
            }
            if (!/[A-Z]/.test(pwd)) {
                toast.error('Password must contain at least one uppercase letter.');
                setIsLoading(false);
                return;
            }
            if (!/[0-9]/.test(pwd)) {
                toast.error('Password must contain at least one number.');
                setIsLoading(false);
                return;
            }
        }

        try {
            console.log('Sending request to API...');
            const response = isLogin
                ? await adminApi.login({ email: formData.email, password: formData.password })
                : await adminApi.signup({ name: formData.name, email: formData.email, password: formData.password });

            console.log('API Response:', response);

            const { token, admin } = response.data.result;

            const authData = {
                ...admin,
                token,
                role: 'admin'
            };

            console.log('Login successful! Auth Data:', authData);

            login(authData);

            toast.success(isLogin ? 'Welcome back, Administrator.' : 'Administrator Account Created.');
            navigate('/admin');
        } catch (error) {
            console.error('Login error:', error);
            console.error('Error response:', error.response?.data);
            toast.error(error.response?.data?.message || 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
            {/* Background Decorations */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-[10%] -top-[20%] h-[800px] w-[800px] rounded-full bg-primary/10 opacity-40 blur-[120px]"></div>
                <div className="absolute -bottom-[10%] -right-[10%] h-[600px] w-[600px] rounded-full bg-white opacity-60 blur-[100px]"></div>
            </div>

            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
                className="relative flex min-h-[600px] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg md:flex-row"
            >
                {/* Left Side: Form */}
                <div className="relative z-10 flex w-full flex-col justify-center bg-white p-10 md:w-[45%] md:p-16">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isLogin ? 'login' : 'signup'}
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 30, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="space-y-8"
                        >
                            <div className="space-y-2">
                                <motion.h1
                                    className="text-4xl font-black tracking-tight text-slate-900"
                                    layoutId="auth-title"
                                >
                                    {isLogin ? 'Login' : 'Sign Up'}
                                </motion.h1>
                                <p className="text-base font-medium text-slate-400">
                                    {isLogin
                                        ? `Welcome to ${appName} Admin Platform`
                                        : 'Start managing your platform today'}
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <AnimatePresence mode="popLayout">
                                    {!isLogin && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0, y: -10 }}
                                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                                            exit={{ height: 0, opacity: 0, y: -10 }}
                                            className="group relative"
                                        >
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary">
                                                <User size={18} />
                                            </div>
                                            <input
                                                type="text"
                                                name="name"
                                                required
                                                maxLength={50}
                                                pattern="[a-zA-Z\s]*"
                                                value={formData.name}
                                                onChange={(e) => {
                                                    e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                                                    handleChange(e);
                                                }}
                                                placeholder="Full Name"
                                                className="w-full rounded-xl border-2 border-transparent bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/10"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="group relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary">
                                        <Mail size={18} />
                                    </div>
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="Username or email"
                                        className="w-full rounded-xl border-2 border-transparent bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/10"
                                    />
                                </div>

                                <div className="group relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        required
                                        minLength={10}
                                        maxLength={128}
                                        autoComplete="current-password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="Password (min 10 chars)"
                                        className="w-full rounded-xl border-2 border-transparent bg-slate-50 py-4 pl-12 pr-12 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-primary focus:outline-none"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary py-4 text-base font-black text-white shadow-sm shadow-primary/30 transition-all hover:scale-[1.01] hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                            className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white"
                                        />
                                    ) : (
                                        <>
                                            <span>{isLogin ? 'Login Now' : 'Create Account'}</span>
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </button>
                            </form>

                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Right Side: Illustration & Curve */}
                <div className="relative hidden w-[55%] items-center justify-center overflow-hidden bg-slate-50 md:flex">
                    <div className="absolute right-6 top-6 z-30">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-primary/10 bg-white/85 shadow-sm backdrop-blur-sm">
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt={`${appName} logo`}
                                    className="h-11 w-11 object-contain"
                                />
                            ) : (
                                <ShieldCheck size={26} className="text-primary" />
                            )}
                        </div>
                    </div>
                    {/* The Smooth Curve (SVG) */}
                    <div className="absolute inset-y-0 -left-1 z-20 w-[200px]">
                        <svg className="h-full w-full fill-white" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <path d="M 0 0 C 40 0, 100 20, 100 50 C 100 80, 40 100, 0 100 Z"></path>
                        </svg>
                    </div>

                    {/* Lottie Animation Scene */}
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-16">
                        {/* Glow Effect Backdrop */}
                        <div className="absolute h-64 w-64 rounded-full bg-primary/10 blur-[80px]" />

                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 1, type: "spring" }}
                            className="relative z-10 w-full max-w-[380px]"
                        >
                            {backendAnimation && (
                                <Lottie
                                    animationData={backendAnimation}
                                    loop={true}
                                    className="h-auto w-full"
                                />
                            )}
                        </motion.div>

                    </div>
                </div>
            </motion.div>

            {/* Verification Label */}
            <div className="absolute bottom-8 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[5px] text-slate-400">
                <div className="h-px w-8 bg-slate-200"></div>
                {`Protected by ${appName} Security`}
                <div className="h-px w-8 bg-slate-200"></div>
            </div>
        </div>
    );
};

export default AdminAuth;
