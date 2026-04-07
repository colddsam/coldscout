/**
 * Profile Management Page — LinkedIn-style editor.
 *
 * Comprehensive profile editor with tabbed sections:
 * - Basic Info: username, phone, gender, bio, location, website, photo, banner
 * - Business Details (clients): company, brand, industry, social links
 * - Freelancer Details (freelancers): title, skills, rates, availability, social links
 * - Portfolio (freelancers): project showcase with CRUD
 * - Privacy: visibility toggles for profile and individual fields
 *
 * Monochrome black & white theme with Framer Motion animations,
 * matching the PublicProfile.tsx LinkedIn-style layout.
 */
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  User, Camera, Building2, Briefcase, FolderOpen, Shield, Check, X,
  Plus, Trash2, ExternalLink, Loader2, Globe, Phone, MapPin,
  Edit3, Eye, EyeOff, Link2, AtSign, Copy,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import {
  pageTransition, staggerContainer, staggerItem, fadeInUp, scaleIn,
  defaultViewport,
} from '../lib/motion';
import {
  getMyProfile, setupProfile, updateMyProfile, checkUsername,
  uploadProfilePhoto, uploadProfileBanner,
  getMyBusinessProfile, updateMyBusinessProfile,
  getMyFreelancerProfile, updateMyFreelancerProfile,
  getMyPortfolio, createPortfolioItem, updatePortfolioItem, deletePortfolioItem,
} from '../lib/api';
import type {
  UserProfile, UserProfileUpdate, BusinessProfile, BusinessProfileUpdate,
  FreelancerProfile, FreelancerProfileUpdate, PortfolioItem, PortfolioItemCreate,
  Gender, Availability, CompanySize,
} from '../lib/api';

// ── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'basic' | 'business' | 'freelancer' | 'portfolio' | 'privacy';

const TAB_CONFIG: Record<string, { label: string; icon: React.ElementType; roles?: string[] }> = {
  basic: { label: 'Basic Info', icon: User },
  business: { label: 'Business', icon: Building2, roles: ['client'] },
  freelancer: { label: 'Professional', icon: Briefcase, roles: ['freelancer'] },
  portfolio: { label: 'Portfolio', icon: FolderOpen, roles: ['freelancer'] },
  privacy: { label: 'Privacy', icon: Shield },
};

// ── Section Card wrapper (matches PublicProfile) ────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className}`}
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={defaultViewport}
    >
      {children}
    </motion.div>
  );
}

// ── Form Helpers ─────────────────────────────────────────────────────────────

function InputField({
  label, value, onChange, type = 'text', placeholder, maxLength, icon: Icon, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; maxLength?: number;
  icon?: React.ElementType; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-black
            placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-none
            transition-colors disabled:bg-gray-50 disabled:text-gray-500
            ${Icon ? 'pl-9' : ''}`}
        />
      </div>
    </div>
  );
}

function TextAreaField({
  label, value, onChange, placeholder, maxLength, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-black
          placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-none
          transition-colors resize-none"
      />
      {maxLength && (
        <p className="text-[10px] text-gray-400 mt-1 text-right">{value.length}/{maxLength}</p>
      )}
    </div>
  );
}

function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-black
          focus:border-black focus:ring-1 focus:ring-black outline-none transition-colors"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label, description, value, onChange,
}: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-black">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
          ${value ? 'bg-black' : 'bg-gray-200'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
          ${value ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

function TagInput({
  label, tags, onChange, placeholder,
}: {
  label: string; tags: string[]; onChange: (tags: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <motion.span
            key={tag}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-black border border-transparent hover:border-gray-300 transition-colors"
          >
            {tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="text-gray-400 hover:text-black transition-colors">
              <X className="w-3 h-3" />
            </button>
          </motion.span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black
            placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-none transition-colors"
        />
        <Button variant="outline" size="sm" onClick={addTag} disabled={!input.trim()}>Add</Button>
      </div>
    </div>
  );
}

// ── Setup Modal (username selection) ─────────────────────────────────────────

function SetupModal({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleUsernameChange = (val: string) => {
    const newUsername = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(newUsername);
    if (newUsername.length < 3) {
      setAvailability(null);
      setChecking(false);
      clearTimeout(debounceRef.current);
    } else {
      setChecking(true);
    }
  };

  const setup = useMutation({
    mutationFn: () => setupProfile(username),
    onSuccess: () => {
      toast.success('Profile created!');
      onComplete();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (username.length < 3) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await checkUsername(username);
        setAvailability(res);
      } catch {
        setAvailability(null);
      }
      setChecking(false);
    }, 500);
  }, [username]);

  return (
    <Modal open={true} onClose={() => {}} title="Set Up Your Profile">
      <p className="text-sm text-secondary mb-4">Choose a unique username for your public profile.</p>
      <div className="space-y-4">
        <div>
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="your_username"
              maxLength={50}
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-10 py-2.5 text-sm text-black
                placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-none transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checking && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              {!checking && availability?.available && <Check className="w-4 h-4 text-green-500" />}
              {!checking && availability && !availability.available && <X className="w-4 h-4 text-red-500" />}
            </div>
          </div>
          {availability && (
            <p className={`text-xs mt-1.5 ${availability.available ? 'text-green-600' : 'text-red-500'}`}>
              {availability.message}
            </p>
          )}
        </div>
        <Button
          onClick={() => setup.mutate()}
          loading={setup.isPending}
          disabled={!availability?.available}
          className="w-full"
        >
          Create Profile
        </Button>
      </div>
    </Modal>
  );
}

// ── Main Profile Page ────────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = user?.role || 'freelancer';

  const [activeTab, setActiveTab] = useState<TabId>('basic');

  // Core profile
  const profileQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getMyProfile,
    retry: false,
  });

  const needsSetup = profileQuery.isError && (profileQuery.error as Error)?.message?.includes('not set up');

  const profileMutation = useMutation({
    mutationFn: (data: UserProfileUpdate) => updateMyProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Profile updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Business profile
  const businessQuery = useQuery({
    queryKey: ['profile', 'business'],
    queryFn: getMyBusinessProfile,
    enabled: role === 'client',
    retry: false,
  });

  const businessMutation = useMutation({
    mutationFn: (data: BusinessProfileUpdate) => updateMyBusinessProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile', 'business'] }); toast.success('Business profile updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Freelancer profile
  const freelancerQuery = useQuery({
    queryKey: ['profile', 'freelancer'],
    queryFn: getMyFreelancerProfile,
    enabled: role === 'freelancer',
    retry: false,
  });

  const freelancerMutation = useMutation({
    mutationFn: (data: FreelancerProfileUpdate) => updateMyFreelancerProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile', 'freelancer'] }); toast.success('Professional profile updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Portfolio
  const portfolioQuery = useQuery({
    queryKey: ['profile', 'portfolio'],
    queryFn: getMyPortfolio,
    enabled: role === 'freelancer',
  });

  // Photo/banner upload
  const photoMutation = useMutation({
    mutationFn: uploadProfilePhoto,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Photo uploaded'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bannerMutation = useMutation({
    mutationFn: uploadProfileBanner,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Banner uploaded'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (needsSetup) {
    return <SetupModal onComplete={() => queryClient.invalidateQueries({ queryKey: ['profile'] })} />;
  }

  if (profileQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const profile = profileQuery.data;
  if (!profile) return null;

  const tabs = Object.entries(TAB_CONFIG).filter(
    ([, cfg]) => !cfg.roles || cfg.roles.includes(role)
  );

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4 pb-12">

        {/* ── Hero Card: Banner + Avatar + Info (LinkedIn style) ── */}
        <SectionCard>
          {/* Dark gradient banner */}
          <motion.div
            className="relative h-44 sm:h-56 bg-gradient-to-br from-gray-900 via-gray-800 to-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {profile.banner_url ? (
              <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.05),transparent_70%)]" />
            )}
            <motion.button
              onClick={() => document.getElementById('banner-input')?.click()}
              disabled={bannerMutation.isPending}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm
                text-xs font-medium text-black hover:bg-white transition-colors shadow-sm border border-gray-200"
            >
              {bannerMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              Edit Cover
            </motion.button>
            <input id="banner-input" type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) bannerMutation.mutate(f); e.target.value = ''; }} />
          </motion.div>

          {/* Profile info area */}
          <div className="px-6 pb-6">
            {/* Avatar — overlapping banner */}
            <motion.div
              className="relative -mt-16 sm:-mt-20 mb-4"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
            >
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-white bg-white shadow-md overflow-hidden">
                {(profile.profile_photo_url || profile.avatar_url) ? (
                  <img src={profile.profile_photo_url || profile.avatar_url || undefined} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                    <User className="w-16 h-16" />
                  </div>
                )}
              </div>
              <motion.button
                onClick={() => document.getElementById('photo-input')?.click()}
                disabled={photoMutation.isPending}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="absolute bottom-2 left-24 sm:left-28 p-2 rounded-full bg-white shadow-md border border-gray-200
                  text-gray-600 hover:text-black transition-colors"
              >
                {photoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </motion.button>
              <input id="photo-input" type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) photoMutation.mutate(f); e.target.value = ''; }} />
            </motion.div>

            {/* Name + headline + meta */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              <motion.div variants={staggerItem}>
                <h1 className="text-2xl sm:text-3xl font-bold text-black tracking-tight">
                  {profile.full_name || 'Your Name'}
                </h1>
                {profile.bio && (
                  <p className="text-base text-gray-700 mt-0.5 max-w-2xl">{profile.bio}</p>
                )}
              </motion.div>

              {/* Username + copy + view profile row */}
              <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
                <ProfileUrlCopy username={profile.username} />
                {profile.username && (
                  <a
                    href={`/u/${profile.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-black transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5" /> View public profile
                  </a>
                )}
              </motion.div>

              {/* Location + role badge row */}
              <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm text-secondary">
                {profile.location && (
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{profile.location}</span>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-black transition-colors">
                    <Link2 className="w-3.5 h-3.5" />{profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                  {role === 'freelancer' ? <Briefcase className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                  {role === 'freelancer' ? 'Freelancer' : 'Business'}
                </span>
              </motion.div>
            </motion.div>
          </div>
        </SectionCard>

        {/* ── Tab Navigation (LinkedIn-style underline tabs) ── */}
        <SectionCard className="!shadow-none">
          <div className="flex gap-1 px-4 overflow-x-auto">
            {tabs.map(([id, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as TabId)}
                  className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
                    ${activeTab === id
                      ? 'text-black'
                      : 'text-gray-500 hover:text-black hover:bg-gray-50 rounded-t-lg'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {cfg.label}
                  {activeTab === id && (
                    <motion.div
                      layoutId="profile-tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            {activeTab === 'basic' && (
              <BasicInfoTab profile={profile} onSave={(d) => profileMutation.mutate(d)} saving={profileMutation.isPending} />
            )}
            {activeTab === 'business' && (
              <BusinessTab data={businessQuery.data} onSave={(d) => businessMutation.mutate(d)} saving={businessMutation.isPending} />
            )}
            {activeTab === 'freelancer' && (
              <FreelancerTab data={freelancerQuery.data} onSave={(d) => freelancerMutation.mutate(d)} saving={freelancerMutation.isPending} />
            )}
            {activeTab === 'portfolio' && (
              <PortfolioTab items={portfolioQuery.data || []} queryClient={queryClient} />
            )}
            {activeTab === 'privacy' && (
              <PrivacyTab profile={profile} onSave={(d) => profileMutation.mutate(d)} saving={profileMutation.isPending} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Profile URL Copy ───────────────────────────────────────────────────────

function ProfileUrlCopy({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);

  const copyProfileUrl = () => {
    const url = `${window.location.origin}/u/${username}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={copyProfileUrl}
      title="Copy profile URL"
      className="flex items-center gap-1.5 text-sm text-secondary hover:text-black transition-colors group"
    >
      <span>@{username}</span>
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      }
    </button>
  );
}

// ── Basic Info Tab ───────────────────────────────────────────────────────────

function BasicInfoTab({
  profile, onSave, saving,
}: {
  profile: UserProfile; onSave: (d: UserProfileUpdate) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    username: profile.username || '',
    phone: profile.phone || '',
    gender: profile.gender || '',
    bio: profile.bio || '',
    location: profile.location || '',
    website: profile.website || '',
  });

  const set = (key: string) => (val: string) => setForm((p) => ({ ...p, [key]: val }));

  return (
    <SectionCard>
      <div className="p-6">
        <h2 className="text-lg font-bold text-black mb-5">Basic Information</h2>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerItem}><InputField label="Username" value={form.username} onChange={set('username')} icon={AtSign} placeholder="your_username" maxLength={50} /></motion.div>
          <motion.div variants={staggerItem}><InputField label="Phone" value={form.phone} onChange={set('phone')} icon={Phone} placeholder="+91 XXXXX XXXXX" maxLength={20} /></motion.div>
          <motion.div variants={staggerItem}>
            <SelectField
              label="Gender"
              value={form.gender}
              onChange={set('gender')}
              placeholder="Select gender"
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'non_binary', label: 'Non-binary' },
                { value: 'other', label: 'Other' },
                { value: 'prefer_not_to_say', label: 'Prefer not to say' },
              ]}
            />
          </motion.div>
          <motion.div variants={staggerItem}><InputField label="Location" value={form.location} onChange={set('location')} icon={MapPin} placeholder="City, Country" maxLength={200} /></motion.div>
          <motion.div variants={staggerItem} className="md:col-span-2"><InputField label="Website" value={form.website} onChange={set('website')} icon={Link2} placeholder="https://yoursite.com" maxLength={500} /></motion.div>
        </motion.div>
        <motion.div className="mt-5" variants={fadeInUp} initial="hidden" animate="visible">
          <TextAreaField label="Bio" value={form.bio} onChange={set('bio')} placeholder="Tell us about yourself..." maxLength={500} />
        </motion.div>
        <motion.div className="flex justify-end mt-6" variants={fadeInUp} initial="hidden" animate="visible">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button onClick={() => onSave({ ...form, gender: (form.gender || undefined) as Gender | undefined })} loading={saving}>Save Changes</Button>
          </motion.div>
        </motion.div>
      </div>
    </SectionCard>
  );
}

// ── Business Tab ─────────────────────────────────────────────────────────────

function BusinessTab({
  data, onSave, saving,
}: {
  data?: BusinessProfile | null; onSave: (d: BusinessProfileUpdate) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    company_name: data?.company_name || '',
    brand_name: data?.brand_name || '',
    industry: data?.industry || '',
    company_size: data?.company_size || '',
    founded_year: data?.founded_year?.toString() || '',
    company_website: data?.company_website || '',
    company_description: data?.company_description || '',
    address: data?.address || '',
    city: data?.city || '',
    state: data?.state || '',
    country: data?.country || '',
    postal_code: data?.postal_code || '',
    linkedin_url: data?.linkedin_url || '',
    twitter_url: data?.twitter_url || '',
    facebook_url: data?.facebook_url || '',
    instagram_url: data?.instagram_url || '',
  });

  const set = (key: string) => (val: string) => setForm((p) => ({ ...p, [key]: val }));

  const handleSave = () => {
    const payload = {
      ...form,
      company_size: (form.company_size || undefined) as CompanySize | undefined,
      founded_year: form.founded_year ? parseInt(form.founded_year) : undefined,
    };
    onSave(payload);
  };

  return (
    <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={staggerItem}>
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-5">Company Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputField label="Company Name" value={form.company_name} onChange={set('company_name')} icon={Building2} placeholder="Acme Inc." />
              <InputField label="Brand Name" value={form.brand_name} onChange={set('brand_name')} placeholder="Your Brand" />
              <InputField label="Industry" value={form.industry} onChange={set('industry')} placeholder="Technology, Marketing..." />
              <SelectField
                label="Company Size"
                value={form.company_size}
                onChange={set('company_size')}
                placeholder="Select size"
                options={[
                  { value: '1-10', label: '1-10 employees' },
                  { value: '11-50', label: '11-50 employees' },
                  { value: '51-200', label: '51-200 employees' },
                  { value: '201-500', label: '201-500 employees' },
                  { value: '501-1000', label: '501-1000 employees' },
                  { value: '1000+', label: '1000+ employees' },
                ]}
              />
              <InputField label="Founded Year" value={form.founded_year} onChange={set('founded_year')} type="number" placeholder="2020" />
              <InputField label="Company Website" value={form.company_website} onChange={set('company_website')} icon={Globe} placeholder="https://company.com" />
            </div>
            <div className="mt-5">
              <TextAreaField label="Company Description" value={form.company_description} onChange={set('company_description')} placeholder="Describe your company..." maxLength={2000} />
            </div>
          </div>
        </SectionCard>
      </motion.div>

      <motion.div variants={staggerItem}>
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-5">Address</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <InputField label="Street Address" value={form.address} onChange={set('address')} icon={MapPin} placeholder="123 Main St" />
              </div>
              <InputField label="City" value={form.city} onChange={set('city')} placeholder="Mumbai" />
              <InputField label="State" value={form.state} onChange={set('state')} placeholder="Maharashtra" />
              <InputField label="Country" value={form.country} onChange={set('country')} placeholder="India" />
              <InputField label="Postal Code" value={form.postal_code} onChange={set('postal_code')} placeholder="400001" />
            </div>
          </div>
        </SectionCard>
      </motion.div>

      <motion.div variants={staggerItem}>
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-5">Social Links</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputField label="LinkedIn" value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://linkedin.com/company/..." />
              <InputField label="Twitter / X" value={form.twitter_url} onChange={set('twitter_url')} placeholder="https://x.com/..." />
              <InputField label="Facebook" value={form.facebook_url} onChange={set('facebook_url')} placeholder="https://facebook.com/..." />
              <InputField label="Instagram" value={form.instagram_url} onChange={set('instagram_url')} placeholder="https://instagram.com/..." />
            </div>
          </div>
        </SectionCard>
      </motion.div>

      <motion.div className="flex justify-end" variants={staggerItem}>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button onClick={handleSave} loading={saving}>Save Business Details</Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Freelancer Tab ───────────────────────────────────────────────────────────

function FreelancerTab({
  data, onSave, saving,
}: {
  data?: FreelancerProfile | null; onSave: (d: FreelancerProfileUpdate) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    professional_title: data?.professional_title || '',
    skills: data?.skills || [],
    experience_years: data?.experience_years?.toString() || '',
    hourly_rate: data?.hourly_rate || '',
    availability: data?.availability || '',
    languages: data?.languages || [],
    education: data?.education || '',
    certifications: data?.certifications || [],
    linkedin_url: data?.linkedin_url || '',
    github_url: data?.github_url || '',
    twitter_url: data?.twitter_url || '',
    dribbble_url: data?.dribbble_url || '',
    behance_url: data?.behance_url || '',
    personal_website: data?.personal_website || '',
    booking_url: data?.booking_url || '',
  });

  const set = (key: string) => (val: string | string[] | number | boolean | null) => setForm((p) => ({ ...p, [key]: val }));

  const handleSave = () => {
    const payload: FreelancerProfileUpdate = {
      ...form,
      experience_years: form.experience_years ? parseInt(form.experience_years) : undefined,
      availability: (form.availability || undefined) as Availability | undefined,
    };
    onSave(payload);
  };

  return (
    <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={staggerItem}>
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-5">Professional Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputField label="Professional Title" value={form.professional_title} onChange={set('professional_title')} icon={Briefcase} placeholder="Full-Stack Developer" />
              <InputField label="Experience (years)" value={form.experience_years} onChange={set('experience_years')} type="number" placeholder="5" />
              <InputField label="Hourly Rate" value={form.hourly_rate} onChange={set('hourly_rate')} placeholder="$50-80/hr or 4000-6000 INR/hr" />
              <SelectField
                label="Availability"
                value={form.availability}
                onChange={set('availability')}
                placeholder="Select availability"
                options={[
                  { value: 'available', label: 'Available' },
                  { value: 'busy', label: 'Busy' },
                  { value: 'not_available', label: 'Not Available' },
                  { value: 'open_to_offers', label: 'Open to Offers' },
                ]}
              />
            </div>
            <div className="mt-5 space-y-5">
              <TagInput label="Skills" tags={form.skills} onChange={set('skills')} placeholder="Add a skill..." />
              <TagInput label="Languages" tags={form.languages} onChange={set('languages')} placeholder="Add a language..." />
              <TextAreaField label="Education" value={form.education} onChange={set('education')} placeholder="Your education background..." />
              <TagInput label="Certifications" tags={form.certifications} onChange={set('certifications')} placeholder="Add a certification..." />
            </div>
          </div>
        </SectionCard>
      </motion.div>

      <motion.div variants={staggerItem}>
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-5">Social & Professional Links</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputField label="LinkedIn" value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://linkedin.com/in/..." />
              <InputField label="GitHub" value={form.github_url} onChange={set('github_url')} placeholder="https://github.com/..." />
              <InputField label="Twitter / X" value={form.twitter_url} onChange={set('twitter_url')} placeholder="https://x.com/..." />
              <InputField label="Dribbble" value={form.dribbble_url} onChange={set('dribbble_url')} placeholder="https://dribbble.com/..." />
              <InputField label="Behance" value={form.behance_url} onChange={set('behance_url')} placeholder="https://behance.net/..." />
              <InputField label="Personal Website" value={form.personal_website} onChange={set('personal_website')} icon={Globe} placeholder="https://yoursite.com" />
              <InputField label="Booking URL" value={form.booking_url} onChange={set('booking_url')} icon={Link2} placeholder="https://calendly.com/your-link" />
            </div>
            <p className="mt-2 text-xs text-gray-400">Booking URL: Your Calendly, Cal.com, or any scheduling link for leads to book meetings.</p>
          </div>
        </SectionCard>
      </motion.div>

      <motion.div className="flex justify-end" variants={staggerItem}>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button onClick={handleSave} loading={saving}>Save Professional Details</Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Portfolio Tab ────────────────────────────────────────────────────────────

function PortfolioTab({
  items, queryClient,
}: {
  items: PortfolioItem[]; queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);

  const deleteMut = useMutation({
    mutationFn: deletePortfolioItem,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile', 'portfolio'] }); toast.success('Item deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <motion.div className="flex justify-between items-center" variants={fadeInUp} initial="hidden" animate="visible">
        <p className="text-sm text-secondary">Showcase your work to potential clients.</p>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>
            Add Project
          </Button>
        </motion.div>
      </motion.div>

      {items.length === 0 && !showAdd && (
        <motion.div variants={scaleIn} initial="hidden" animate="visible">
          <SectionCard className="text-center">
            <div className="py-12">
              <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-secondary">No portfolio items yet. Add your first project!</p>
            </div>
          </SectionCard>
        </motion.div>
      )}

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {items.map((item) => (
          <motion.div key={item.id} variants={staggerItem}>
            <SectionCard className="h-full group">
              <div className="p-0">
                {item.image_url && (
                  <div className="overflow-hidden h-40">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-black">{item.title}</h4>
                      {item.client_name && <p className="text-xs text-secondary mt-0.5">for {item.client_name}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingItem(item)} className="p-1.5 rounded-md text-gray-400 hover:text-black hover:bg-gray-100 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteMut.mutate(item.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {item.description && <p className="text-xs text-gray-600 mt-2 line-clamp-2">{item.description}</p>}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {item.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    {item.project_url && (
                      <a href={item.project_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-secondary hover:text-black flex items-center gap-1 transition-colors">
                        <ExternalLink className="w-3 h-3" /> View Project
                      </a>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.is_public ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                      {item.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                </div>
              </div>
            </SectionCard>
          </motion.div>
        ))}
      </motion.div>

      {(showAdd || editingItem) && (
        <PortfolioItemModal
          item={editingItem}
          onClose={() => { setShowAdd(false); setEditingItem(null); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['profile', 'portfolio'] });
            setShowAdd(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function PortfolioItemModal({
  item, onClose, onSaved,
}: {
  item?: PortfolioItem | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: item?.title || '',
    description: item?.description || '',
    project_url: item?.project_url || '',
    image_url: item?.image_url || '',
    tags: item?.tags || [],
    client_name: item?.client_name || '',
    is_public: item?.is_public ?? true,
  });

  const set = (key: string) => (val: string | string[] | number | boolean | null) => setForm((p) => ({ ...p, [key]: val }));

  const mutation = useMutation({
    mutationFn: () => {
      if (item) return updatePortfolioItem(item.id, form);
      return createPortfolioItem(form as PortfolioItemCreate);
    },
    onSuccess: () => { toast.success(item ? 'Updated' : 'Added'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={true} onClose={onClose} title={item ? 'Edit Project' : 'Add Project'} maxWidth="max-w-lg">
      <div className="space-y-4">
        <InputField label="Title" value={form.title} onChange={set('title')} placeholder="Project name" />
        <TextAreaField label="Description" value={form.description} onChange={set('description')} placeholder="What did you build?" maxLength={2000} />
        <InputField label="Project URL" value={form.project_url} onChange={set('project_url')} icon={Link2} placeholder="https://..." />
        <InputField label="Image URL" value={form.image_url} onChange={set('image_url')} icon={Camera} placeholder="https://..." />
        <InputField label="Client Name" value={form.client_name} onChange={set('client_name')} placeholder="Client or company name" />
        <TagInput label="Tags" tags={form.tags} onChange={set('tags')} placeholder="react, typescript..." />
        <ToggleField label="Public" description="Visible on your public profile" value={form.is_public} onChange={set('is_public')} />
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          {item ? 'Save Changes' : 'Add Project'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Privacy Tab ──────────────────────────────────────────────────────────────

function PrivacyTab({
  profile, onSave, saving,
}: {
  profile: UserProfile; onSave: (d: UserProfileUpdate) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    is_public: profile.is_public,
    show_email: profile.show_email,
    show_phone: profile.show_phone,
    show_location: profile.show_location,
    show_date_of_birth: profile.show_date_of_birth,
  });

  const set = (key: string) => (val: boolean) => setForm((p) => ({ ...p, [key]: val }));

  return (
    <SectionCard>
      <div className="p-6">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          <motion.div variants={staggerItem}>
            <h2 className="text-lg font-bold text-black mb-1">Profile Visibility</h2>
            <p className="text-sm text-secondary mb-5">Control who can see your profile and information.</p>
          </motion.div>

          <div className="space-y-1">
            <motion.div variants={staggerItem}>
              <ToggleField
                label="Public Profile"
                description="When disabled, your profile is only visible to you"
                value={form.is_public}
                onChange={set('is_public')}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <ToggleField
                label="Show Email Address"
                description="Display your email on your public profile"
                value={form.show_email}
                onChange={set('show_email')}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <ToggleField
                label="Show Phone Number"
                description="Display your phone number on your public profile"
                value={form.show_phone}
                onChange={set('show_phone')}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <ToggleField
                label="Show Location"
                description="Display your location on your public profile"
                value={form.show_location}
                onChange={set('show_location')}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <ToggleField
                label="Show Date of Birth"
                description="Display your date of birth on your public profile"
                value={form.show_date_of_birth}
                onChange={set('show_date_of_birth')}
              />
            </motion.div>
          </div>

          <motion.div variants={staggerItem} className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
            <AnimatePresence mode="wait">
              <motion.div
                key={form.is_public ? 'public' : 'private'}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 text-sm text-secondary"
              >
                {form.is_public ? (
                  <>
                    <Eye className="w-4 h-4 text-green-600" />
                    <span>Your profile is <strong className="text-green-700">public</strong> and visible to everyone</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 text-gray-500" />
                    <span>Your profile is <strong className="text-gray-700">private</strong> and only visible to you</span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          <motion.div className="flex justify-end mt-6" variants={staggerItem}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button onClick={() => onSave(form)} loading={saving}>Save Privacy Settings</Button>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </SectionCard>
  );
}
