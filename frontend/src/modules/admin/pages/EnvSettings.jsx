import React, { useState } from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import {
    Save,
    Terminal,
    Globe,
    Server,
    Shield,
    Database,
    Cloud,
    CreditCard,
    MessageSquare,
    Eye,
    EyeOff,
    Lock,
    Key,
    AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';

const EnvSettings = () => {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('frontend');
    const [showSecrets, setShowSecrets] = useState({});

    // Mock initial state
    const [config, setConfig] = useState({
        // Frontend
        VITE_API_BASE_URL: 'http://localhost:5000/api/v1',
        VITE_GOOGLE_MAPS_API_KEY: '',
        VITE_FIREBASE_API_KEY: '',
        VITE_FIREBASE_AUTH_DOMAIN: '',
        VITE_FIREBASE_PROJECT_ID: '',
        VITE_FIREBASE_STORAGE_BUCKET: '',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '',
        VITE_FIREBASE_APP_ID: '',
        VITE_FIREBASE_MEASUREMENT_ID: '',
        VITE_FIREBASE_VAPID_KEY: '',

        // Backend
        FRONTEND_URL: 'http://localhost:5173',
        PORT: 5000,
        JWT_EXPIRES_IN: '7d',
        JWT_REFRESH_EXPIRES_IN: '7d',
        JWT_REFRESH_SECRET: '', // Secret
        JWT_SECRET: '', // Secret

        CLOUDINARY_API_KEY: '',
        CLOUDINARY_API_SECRET: '', // Secret
        CLOUDINARY_CLOUD_NAME: '',

        SMS_INDIA_HUB_USERNAME: '',
        SMS_INDIA_HUB_API_KEY: '', // Secret
        SMS_INDIA_HUB_SENDER_ID: '',
        SMS_INDIA_HUB_DLT_TEMPLATE_ID: '',

        FIREBASE_SERVICE_ACCOUNT: '{}' // JSON
    });

    const toggleSecret = (key) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            showToast('Environment variables updated successfully. Server restart may be required.', 'success');
        }, 1500);
    };

    const InputField = ({ label, name, type = 'text', icon: Icon, isSecret = false, placeholder = '' }) => (
        <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {label}
                {name && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] lowercase text-slate-500">{name}</span>}
            </label>
            <div className="relative">
                {Icon && <Icon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
                <input
                    type={isSecret ? (showSecrets[name] ? 'text' : 'password') : type}
                    value={config[name]}
                    onChange={(e) => handleInputChange(name, e.target.value)}
                    placeholder={placeholder}
                    className={cn(
                        "h-11 w-full rounded-md border border-slate-200 bg-white pr-11 font-mono text-sm font-semibold text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20",
                        Icon ? "pl-10" : "pl-3.5"
                    )}
                />
                {isSecret && (
                    <button
                        onClick={() => toggleSecret(name)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                    >
                        {showSecrets[name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Environment Controls
                        <div className="rounded-lg bg-slate-900 p-1.5">
                            <Terminal className="h-4 w-4 text-white" />
                        </div>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-1">
                        Manage critical application secrets and configurations.
                        <span className="inline-flex items-center gap-1 font-bold text-danger">
                            <AlertTriangle className="h-3 w-3" />
                            Handle with care.
                        </span>
                    </span>
                }
                actions={
                    <Button onClick={handleSave} isLoading={isSaving}>
                        {!isSaving && <Save className="h-4 w-4" />}
                        {isSaving ? 'Deploying...' : 'Save & Deploy'}
                    </Button>
                }
            />

            <div className="flex gap-4 border-b border-slate-100">
                <button
                    onClick={() => setActiveTab('frontend')}
                    className={cn(
                        "border-b-2 px-4 pb-3 text-sm font-bold transition-all",
                        activeTab === 'frontend' ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                >
                    Frontend Configuration
                </button>
                <button
                    onClick={() => setActiveTab('backend')}
                    className={cn(
                        "border-b-2 px-4 pb-3 text-sm font-bold transition-all",
                        activeTab === 'backend' ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                >
                    Backend Configuration
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">

                {/* Frontend Tab */}
                {activeTab === 'frontend' && (
                    <div className="space-y-5">
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                                    <Globe className="h-4 w-4 text-slate-400" />
                                    Core Client Config
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                                <InputField label="API Base URL" name="VITE_API_BASE_URL" icon={Server} placeholder="https://api.yourdomain.com/v1" />
                                <InputField label="Google Maps API Key" name="VITE_GOOGLE_MAPS_API_KEY" icon={Key} isSecret={true} />
                            </div>
                        </Card>

                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                                    <Cloud className="h-4 w-4 text-warning" />
                                    Firebase Client SDK
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                                <InputField label="API Key" name="VITE_FIREBASE_API_KEY" icon={Key} isSecret={true} />
                                <InputField label="Auth Domain" name="VITE_FIREBASE_AUTH_DOMAIN" icon={Shield} />
                                <InputField label="Project ID" name="VITE_FIREBASE_PROJECT_ID" icon={Database} />
                                <InputField label="Storage Bucket" name="VITE_FIREBASE_STORAGE_BUCKET" icon={Database} />
                                <InputField label="Messaging Sender ID" name="VITE_FIREBASE_MESSAGING_SENDER_ID" icon={MessageSquare} />
                                <InputField label="App ID" name="VITE_FIREBASE_APP_ID" icon={Database} />
                                <InputField label="Measurement ID" name="VITE_FIREBASE_MEASUREMENT_ID" icon={Database} />
                                <div className="md:col-span-2">
                                    <InputField label="VAPID Key (Web Push)" name="VITE_FIREBASE_VAPID_KEY" icon={Key} isSecret={true} />
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Backend Tab */}
                {activeTab === 'backend' && (
                    <div className="space-y-5">
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                                    <Server className="h-4 w-4 text-slate-400" />
                                    Server & Security
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                                <InputField label="Frontend URL (CORS)" name="FRONTEND_URL" icon={Globe} />
                                <InputField label="Server Port" name="PORT" icon={Server} type="number" />
                                <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 md:col-span-2 md:grid-cols-2">
                                    <InputField label="JWT Secret" name="JWT_SECRET" icon={Lock} isSecret={true} />
                                    <InputField label="JWT Refresh Secret" name="JWT_REFRESH_SECRET" icon={Lock} isSecret={true} />
                                    <InputField label="Token Expiry" name="JWT_EXPIRES_IN" icon={Terminal} placeholder="7d" />
                                    <InputField label="Refresh Token Expiry" name="JWT_REFRESH_EXPIRES_IN" icon={Terminal} placeholder="7d" />
                                </div>
                            </div>
                        </Card>

                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                                    <CreditCard className="h-4 w-4 text-info" />
                                    Integrations
                                </h3>
                            </div>
                            <div className="space-y-6 p-4">
                                {/* Cloudinary */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase text-slate-400">Cloudinary (Media)</h4>
                                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                                        <InputField label="Cloud Name" name="CLOUDINARY_CLOUD_NAME" icon={Cloud} />
                                        <InputField label="API Key" name="CLOUDINARY_API_KEY" icon={Key} isSecret={true} />
                                        <InputField label="API Secret" name="CLOUDINARY_API_SECRET" icon={Lock} isSecret={true} />
                                    </div>
                                </div>

                                {/* SMS Hub */}
                                <div className="space-y-3 border-t border-slate-100 pt-4">
                                    <h4 className="text-xs font-bold uppercase text-slate-400">SMS India Hub</h4>
                                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                        <InputField label="Username" name="SMS_INDIA_HUB_USERNAME" icon={Terminal} />
                                        <InputField label="Sender ID" name="SMS_INDIA_HUB_SENDER_ID" icon={MessageSquare} />
                                        <InputField label="API Key" name="SMS_INDIA_HUB_API_KEY" icon={Key} isSecret={true} />
                                        <InputField label="DLT Template ID" name="SMS_INDIA_HUB_DLT_TEMPLATE_ID" icon={Terminal} />
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/30 p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-900">
                                    <Shield className="h-4 w-4 text-danger" />
                                    Firebase Admin Service Account
                                </h3>
                            </div>
                            <div className="p-4">
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Service Account JSON
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] lowercase text-slate-500">FIREBASE_SERVICE_ACCOUNT</span>
                                    </label>
                                    <textarea
                                        rows={8}
                                        value={config.FIREBASE_SERVICE_ACCOUNT}
                                        onChange={(e) => handleInputChange('FIREBASE_SERVICE_ACCOUNT', e.target.value)}
                                        placeholder='{"type": "service_account", ...}'
                                        className="w-full resize-none rounded-md border-none bg-slate-900 px-4 py-3.5 font-mono text-xs text-primary outline-none transition-all focus:ring-2 focus:ring-primary/30"
                                    />
                                    <p className="text-[10px] font-medium italic text-slate-400">Paste the entire JSON content of your service account key file here.</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnvSettings;
