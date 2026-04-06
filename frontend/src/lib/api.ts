/**
 * Backend API Client & Core Data Models.
 *
 * Provides a type-safe interface for the AI Lead Generation backend.
 * Handles authentication header injection using Supabase session tokens,
 * session lifecycle management via axios interceptors, and error normalization.
 *
 * Token Priority:
 * 1. Supabase session token (primary)
 * 2. Legacy localStorage token (fallback for existing sessions)
 */
import axios from 'axios';
import { supabase } from './supabase';

/**
 * Core Axios configuration.
 * Manages base URL, request timeout, and shared security headers.
 *
 * Timeout:
 *   A 30-second timeout is applied globally so that a slow or unresponsive backend
 *   does not block the UI indefinitely. Endpoints that are expected to be long-running
 *   (e.g., CSV export, pipeline trigger) may override this per-request using Axios
 *   config: `client.get('/...', { timeout: 120_000 })`.
 */
const API_KEY = import.meta.env.VITE_API_KEY;

export const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30_000, // 30 seconds — prevents hanging requests from blocking the UI
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});

/**
 * Request interceptor: Injects JWT from Supabase session or localStorage fallback.
 * Also ensures X-API-Key is always present.
 */
client.interceptors.request.use(async (config) => {
  let token: string | null = null;

  // Try to get token from Supabase session first
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      token = session.access_token;
    }
  } catch {
    // Failed to get Supabase session
  }

  // Fallback to legacy localStorage token
  if (!token) {
    token = localStorage.getItem('llp_token');
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Ensure X-API-Key is always present even if headers are overridden
  if (API_KEY) {
    config.headers['X-API-Key'] = API_KEY;
  }

  return config;
});

/**
 * Response interceptor: Normalizes error handling and session lifecycle management.
 * Detects 401/403 status codes to trigger global session expiration events.
 */
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Handle credential failure specifically. We check the detail message
    // to distinguish between session expiry (JWT) and system config errors (API Key).
    const isSessionError =
      err.response?.status === 401 ||
      (err.response?.status === 403 &&
        err.response?.data?.detail === 'Could not validate credentials');

    if (isSessionError) {
      // Clear local storage immediately to prevent further unauthorized requests
      localStorage.removeItem('llp_token');
      localStorage.removeItem('llp_user');

      // Sign out from Supabase to clear session
      try {
        await supabase.auth.signOut();
      } catch {
        // Failed to sign out from Supabase
      }

      const path = window.location.pathname;
      // Signal session expiration if the user is in a protected area.
      if (path !== '/login' && path !== '/' && path !== '/signup' && !path.startsWith('/auth/')) {
        window.dispatchEvent(new CustomEvent('auth-session-expired'));
      }
    }

    const msg = err.response?.data?.detail || err.message || 'Unknown error';
    return Promise.reject(new Error(msg));
  }
);

/**
 * Fetches the authenticated user profile.
 * Used for session recovery and credential verification on app boot.
 */
export const getMe = async () => {
  const { data } = await client.get('/api/v1/me');
  return data;
};

// ── Types ──────────────────────────────────────────────────

export type SystemStatus = 'RUN' | 'HOLD';
export type JobStatus = 'RUN' | 'HOLD';
export type LeadStatus =
  | 'discovered'
  | 'qualified'
  | 'contacted'
  | 'replied'
  | 'closed'
  | 'rejected'
  | 'email_sent';
export type IntentLabel = 'interested' | 'pricing_inquiry' | 'not_interested' | 'unsubscribe' | 'other';
export type PipelineStage =
  | 'discovery'
  | 'qualification'
  | 'personalization'
  | 'outreach'
  | 'report'
  | 'optimization'
  | 'all';

export interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  last_pipeline_status: string;
  scheduler_running: boolean;
  production_status: boolean;
}

export interface PipelineStatusResponse {
  last_run: {
    stage: string;
    status: string;
    at: string | null;
  } | null;
  scheduler_running: boolean;
  jobs: Array<{
    id: string;
    next_run: string | null;
  }>;
}

export interface JobConfig {
  [key: string]: unknown;
  status?: string;
  hour?: number;
  minute?: number;
  minutes?: number;
  day_of_week?: string;
}

export interface JobsConfig {
  [jobId: string]: JobConfig;
}

export interface Lead {
  id: string;
  business_name: string;
  category: string;
  city: string;
  state: string;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  rating: number | null;
  review_count: number | null;
  ai_score: number;
  qualification_notes: string | null;
  status: LeadStatus;
  sequence_stage: number;
  competitor_intel: string | null;
  created_at: string;
  discovered_at: string | null;
  qualified_at: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  social_networks?: SocialNetwork[];
  outreach_records?: OutreachRecord[];
  follow_up_stage: number | null;
  reply_status: string | null;
  reply_summary: string | null;
  personalized_pitch: string | null;
  // International location hierarchy
  country: string | null;
  country_code: string | null;
  region: string | null;
  sub_area: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  // Website qualification
  has_website: boolean;
  // Demo website generation
  demo_site_status: string | null;
  demo_generated_at: string | null;
  demo_view_count: number | null;
}

export interface SocialNetwork {
  id: string;
  platform: string;
  url: string;
}

export interface OutreachRecord {
  id: string;
  lead_id: string;
  subject: string;
  sent_at: string;
  stage: number;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
}

export interface LeadListResponse {
  leads: Lead[];
  total: number;
  page: number;
  pages: number;
}

export interface Campaign {
  id: string;
  name?: string;
  campaign_date: string;
  status?: string;
  total_sent?: number;
  total_opened?: number;
  total_clicked?: number;
  total_replied?: number;
  emails_sent: number;
  emails_opened: number;
  links_clicked: number;
  replies_received: number;
  created_at?: string;
  outreach?: OutreachRecord[];
}

export interface CampaignStats {
  total_discovered: number;
  total_qualified: number;
  total_sent?: number;
  total_opened?: number;
  total_clicked?: number;
  total_replied?: number;
  emails_sent: number;
  emails_opened: number;
  links_clicked: number;
  replies_received: number;
  open_rate?: number;
  click_rate?: number;
  reply_rate?: number;
}

export interface DailyReport {
  id: string;
  report_date: string;
  leads_discovered: number;
  leads_qualified: number;
  emails_personalized?: number;
  emails_sent: number;
  emails_opened: number;
  links_clicked: number;
  replies_received: number;
  pipeline_status: string;
  pipeline_started_at: string | null;
  pipeline_ended_at: string | null;
  report_file_path: string | null;
}

export interface InboxThread {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_email: string;
  from_email?: string;
  subject: string;
  body: string;
  body_preview: string;
  full_body: string;
  received_at: string;
  intent: IntentLabel;
  intent_label?: string;
  ai_draft_response: string | null;
  responded: boolean;
}

// ── API Functions ─────────────────────────────────────────

// Health & System
/**
 * Retrieves system-wide health and version metadata.
 */
export const getHealth = () =>
  client.get<HealthResponse>('/api/v1/health').then((r) => r.data);

/**
 * Globally pauses lead processing and email dispatch.
 */
export const holdSystem = () =>
  client.post('/api/v1/pipeline/hold').then((r) => r.data);

/**
 * Resumes the outreach system from an administrative hold.
 * Restores normal scheduled and manual lead processing.
 */
export const resumeSystem = () =>
  client.post('/api/v1/pipeline/resume').then((r) => r.data);

// Pipeline
/**
 * Retrieves current pipeline execution state, active heartbeats, and run history.
 */
export const getPipelineStatus = () =>
  client.get<PipelineStatusResponse>('/api/v1/pipeline/status').then((r) => r.data);

/**
 * Manually triggers a specific pipeline stage by slug (default: 'all').
 */
export const triggerPipeline = (stage: PipelineStage = 'all') =>
  client.post('/api/v1/pipeline/trigger', { stage }).then((r) => r.data);

// Jobs Config
/**
 * Fetches the interactive job schedule and status configuration.
 */
export const getJobsConfig = () =>
  client.get<JobsConfig>('/api/v1/pipeline/jobs_config').then((r) => r.data);

/**
 * Updates the global job configurations.
 * Allows for dynamic adjustment of polling intervals and execution windows.
 */
export const updateJobsConfig = (config: Record<string, unknown>) =>
  client
    .patch<{ status: string; config: JobsConfig }>('/api/v1/pipeline/jobs_config', config)
    .then((r) => r.data);

// Leads
/**
 * Retrieves paginated leads with support for geographic and status-based filtering.
 */
export const getLeads = (params: {
  page?: number;
  limit?: number;
  status?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  category?: string;
  date_from?: string;
  date_to?: string;
}) => client.get<LeadListResponse>('/api/v1/leads', { params }).then((r) => r.data);

/**
 * Fetches detailed information for a single lead, including outreach history and AI analysis.
 */
export const getLead = (id: string) =>
  client.get<Lead>(`/api/v1/leads/${id}`).then((r) => r.data);

/**
 * Partially updates a lead record (e.g., status changes, adding manual notes).
 */
export const updateLead = (id: string, payload: { status?: string; notes?: string }) =>
  client.patch<Lead>(`/api/v1/leads/${id}`, payload).then((r) => r.data);

/**
 * Permanently deletes a lead from the database.
 */
export const deleteLead = (id: string) =>
  client.delete(`/api/v1/leads/${id}`).then((r) => r.data);

export const exportLeadsCsv = (params?: {
  status?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  category?: string;
}) =>
  client.get('/api/v1/leads/export/csv', { params, responseType: 'blob' }).then((r) => r.data);

// Campaigns
/**
 * Lists all historical outreach campaigns and their high-level aggregate performance.
 */
export const getCampaigns = () =>
  client.get<Campaign[]>('/api/v1/campaigns').then((r) => r.data);

/**
 * Retrieves granular details for a specific campaign.
 */
export const getCampaign = (id: string) =>
  client.get<Campaign>(`/api/v1/campaigns/${id}`).then((r) => r.data);

/**
 * Gets real-time engagement metrics (open rates, click rates) for a campaign.
 */
export const getCampaignStats = (id: string) =>
  client.get<CampaignStats>(`/api/v1/campaigns/${id}/stats`).then((r) => r.data);

// Reports (used as analytics)
/**
 * Fetches daily performance reports containing system-wide KPIs.
 */
export const getReports = () =>
  client.get<DailyReport[]>('/api/v1/reports').then((r) => r.data);

/**
 * Retrieves a specific daily report by its date string.
 */
export const getReportByDate = (date: string) =>
  client.get<DailyReport>(`/api/v1/reports/${date}`).then((r) => r.data);

/**
 * Downloads a generated Excel report for a specific date.
 */
export const downloadReport = (date: string) =>
  client.get(`/api/v1/reports/${date}/download`, { responseType: 'blob' }).then((r) => r.data);

// Inbox (may not exist in backend — will gracefully 404)
/**
 * Retrieves threaded email conversations from the Smart Inbox.
 * Supports filtering by AI-classified intent and response status.
 */
export const getInbox = (params?: { intent?: IntentLabel; responded?: boolean }) =>
  client.get<InboxThread[]>('/api/v1/inbox', { params }).then((r) => r.data);

/**
 * Fetches the full message history and metadata for a specific inbox thread.
 */
export const getInboxThread = (id: string) =>
  client.get<InboxThread>(`/api/v1/inbox/${id}`).then((r) => r.data);

/**
 * Dispatches a manual response to a lead's email reply.
 * Marks the thread as responded in the system.
 */
export const respondToThread = (id: string, body: string) =>
  client.post(`/api/v1/inbox/${id}/respond`, { body }).then((r) => r.data);

/**
 * Manually overrides the AI's intent classification for a specific thread.
 */
export const updateThreadIntent = (id: string, intent: IntentLabel) =>
  client.patch(`/api/v1/inbox/${id}`, { intent }).then((r) => r.data);

// ── Billing ───────────────────────────────────────────────────────────────────

export type BillingPlan = 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type PaymentStatus = 'created' | 'paid' | 'failed';

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  plan: BillingPlan;
  plan_expires_at: string;
  message: string;
}

export interface SubscriptionResponse {
  has_subscription: boolean;
  plan: string;
  status?: SubscriptionStatus;
  current_period_start?: string;
  current_period_end?: string;
  cancelled_at?: string;
}

export interface PaymentTransaction {
  id: string;
  plan: BillingPlan;
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  created_at: string;
}

/**
 * Creates a Razorpay order for the given plan.
 * Returns order_id, amount (paise), currency, and key_id.
 */
export const createPaymentOrder = (plan: BillingPlan) =>
  client.post<CreateOrderResponse>('/api/v1/billing/create-order', { plan }).then((r) => r.data);

/**
 * Verifies the Razorpay payment signature and activates the subscription.
 */
export const verifyPayment = (payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: BillingPlan;
}) =>
  client.post<VerifyPaymentResponse>('/api/v1/billing/verify-payment', payload).then((r) => r.data);

/**
 * Returns the current subscription details for the authenticated user.
 */
export const getSubscription = () =>
  client.get<SubscriptionResponse>('/api/v1/billing/subscription').then((r) => r.data);

/**
 * Returns the payment transaction history for the authenticated user.
 */
export const getTransactions = () =>
  client.get<PaymentTransaction[]>('/api/v1/billing/transactions').then((r) => r.data);

/**
 * Cancels the active subscription (access retained until period end).
 */
export const cancelSubscription = (reason?: string) =>
  client.post<SubscriptionResponse>('/api/v1/billing/cancel', { reason }).then((r) => r.data);

// ── Profile ──────────────────────────────────────────────────────────────────

export type Gender = 'male' | 'female' | 'non_binary' | 'other' | 'prefer_not_to_say';
export type Availability = 'available' | 'busy' | 'not_available' | 'open_to_offers';
export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+';

export interface UserProfile {
  id: number;
  user_id: number;
  username: string;
  phone?: string | null;
  gender?: Gender | null;
  date_of_birth?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  profile_photo_url?: string | null;
  banner_url?: string | null;
  is_public: boolean;
  show_email: boolean;
  show_phone: boolean;
  show_location: boolean;
  show_date_of_birth: boolean;
  created_at: string;
  updated_at: string;
  // Joined user fields
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  plan?: string | null;
  avatar_url?: string | null;
}

export interface UserProfileUpdate {
  username?: string;
  phone?: string;
  gender?: Gender;
  date_of_birth?: string;
  bio?: string;
  location?: string;
  website?: string;
  profile_photo_url?: string;
  banner_url?: string;
  is_public?: boolean;
  show_email?: boolean;
  show_phone?: boolean;
  show_location?: boolean;
  show_date_of_birth?: boolean;
}

export interface UsernameCheckResponse {
  available: boolean;
  message: string;
}

export interface BusinessProfile {
  id: number;
  user_id: number;
  company_name?: string | null;
  brand_name?: string | null;
  industry?: string | null;
  company_size?: CompanySize | null;
  founded_year?: number | null;
  company_website?: string | null;
  company_logo_url?: string | null;
  company_description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessProfileUpdate {
  company_name?: string;
  brand_name?: string;
  industry?: string;
  company_size?: CompanySize;
  founded_year?: number;
  company_website?: string;
  company_logo_url?: string;
  company_description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  is_public?: boolean;
}

export interface FreelancerProfile {
  id: number;
  user_id: number;
  professional_title?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  hourly_rate?: string | null;
  availability?: Availability | null;
  languages?: string[] | null;
  education?: string | null;
  certifications?: string[] | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  twitter_url?: string | null;
  dribbble_url?: string | null;
  behance_url?: string | null;
  personal_website?: string | null;
  is_public: boolean;
  show_rates: boolean;
  show_availability: boolean;
  created_at: string;
  updated_at: string;
}

export interface FreelancerProfileUpdate {
  professional_title?: string;
  skills?: string[];
  experience_years?: number;
  hourly_rate?: string;
  availability?: Availability;
  languages?: string[];
  education?: string;
  certifications?: string[];
  linkedin_url?: string;
  github_url?: string;
  twitter_url?: string;
  dribbble_url?: string;
  behance_url?: string;
  personal_website?: string;
  is_public?: boolean;
  show_rates?: boolean;
  show_availability?: boolean;
}

export interface PortfolioItem {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  project_url?: string | null;
  image_url?: string | null;
  tags?: string[] | null;
  client_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_public: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItemCreate {
  title: string;
  description?: string;
  project_url?: string;
  image_url?: string;
  tags?: string[];
  client_name?: string;
  start_date?: string;
  end_date?: string;
  is_public?: boolean;
  display_order?: number;
}

export interface PortfolioItemUpdate {
  title?: string;
  description?: string;
  project_url?: string;
  image_url?: string;
  tags?: string[];
  client_name?: string;
  start_date?: string;
  end_date?: string;
  is_public?: boolean;
  display_order?: number;
}

export interface PublicProfile {
  username: string;
  full_name?: string | null;
  role?: string | null;
  plan?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  profile_photo_url?: string | null;
  banner_url?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  business?: BusinessProfile | null;
  freelancer?: FreelancerProfile | null;
  portfolio?: PortfolioItem[] | null;
  member_since?: string | null;
}

export interface FileUploadResponse {
  url: string;
  message: string;
}

// Profile API functions

export const checkUsername = (username: string) =>
  client.get<UsernameCheckResponse>(`/api/v1/profile/check-username/${username}`).then((r) => r.data);

export const getMyProfile = () =>
  client.get<UserProfile>('/api/v1/profile/me').then((r) => r.data);

export const setupProfile = (username: string) =>
  client.post<UserProfile>('/api/v1/profile/me/setup', { username }).then((r) => r.data);

export const updateMyProfile = (payload: UserProfileUpdate) =>
  client.put<UserProfile>('/api/v1/profile/me', payload).then((r) => r.data);

export const uploadProfilePhoto = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post<FileUploadResponse>('/api/v1/profile/me/upload-photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const uploadProfileBanner = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post<FileUploadResponse>('/api/v1/profile/me/upload-banner', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const getPublicProfile = (username: string) =>
  client.get<PublicProfile>(`/api/v1/profile/u/${username}`).then((r) => r.data);

export const getMyBusinessProfile = () =>
  client.get<BusinessProfile>('/api/v1/profile/me/business').then((r) => r.data);

export const updateMyBusinessProfile = (payload: BusinessProfileUpdate) =>
  client.put<BusinessProfile>('/api/v1/profile/me/business', payload).then((r) => r.data);

export const getMyFreelancerProfile = () =>
  client.get<FreelancerProfile>('/api/v1/profile/me/freelancer').then((r) => r.data);

export const updateMyFreelancerProfile = (payload: FreelancerProfileUpdate) =>
  client.put<FreelancerProfile>('/api/v1/profile/me/freelancer', payload).then((r) => r.data);

export const getMyPortfolio = () =>
  client.get<PortfolioItem[]>('/api/v1/profile/me/portfolio').then((r) => r.data);

export const createPortfolioItem = (payload: PortfolioItemCreate) =>
  client.post<PortfolioItem>('/api/v1/profile/me/portfolio', payload).then((r) => r.data);

export const updatePortfolioItem = (id: number, payload: PortfolioItemUpdate) =>
  client.put<PortfolioItem>(`/api/v1/profile/me/portfolio/${id}`, payload).then((r) => r.data);

export const deletePortfolioItem = (id: number) =>
  client.delete(`/api/v1/profile/me/portfolio/${id}`).then((r) => r.data);
