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
import { getAuthItem, removeAuthItem } from './authStorage';

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
    token = getAuthItem('llp_token');
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
      removeAuthItem('llp_token');
      removeAuthItem('llp_user');

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

    // Normalize the error message so toast() / .message reads cleanly.
    // FastAPI/Pydantic returns either a string ("Lead not found"), a list
    // of validation issues ([{loc, msg, type}, ...]), or rarely a nested
    // object. Coerce all three into a single human-readable string so we
    // never display "[object Object]" or comma-joined garbage.
    const detail = err.response?.data?.detail;
    let msg: string;
    if (typeof detail === 'string') {
      msg = detail;
    } else if (Array.isArray(detail)) {
      msg = detail
        .map((d: unknown) => {
          if (typeof d === 'string') return d;
          if (d && typeof d === 'object' && 'msg' in d) {
            return String((d as { msg?: unknown }).msg ?? '');
          }
          return '';
        })
        .filter(Boolean)
        .join('; ') || 'Validation error';
    } else if (detail && typeof detail === 'object') {
      msg = JSON.stringify(detail);
    } else {
      msg = err.message || 'Unknown error';
    }
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
  | 'daily_report'
  | 'weekly_optimization'
  | 'threads_discovery'
  | 'threads_qualification'
  | 'threads_engagement'
  | 'threads_response_check'
  | 'all';

export interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  last_pipeline_status: string;
  scheduler_running: boolean;
  production_status: boolean;
}

/**
 * How a pipeline run was kicked off.
 *
 * - 'manual'    — user clicked Run Stage / Run Full Pipeline.
 * - 'scheduler' — APScheduler fired the cron / interval trigger.
 * - 'system'    — fallback for jobs whose origin couldn't be determined
 *   (e.g. legacy entries, or a stage finalized without a prior enqueue).
 */
export type JobTriggerSource = 'manual' | 'scheduler' | 'system';

/**
 * Status values surfaced by the pipeline tracker.
 *
 * 'skipped' is distinct from 'failed' — it means the run did not execute
 * because the pipeline is intentionally paused (global or per-freelancer
 * HOLD). The UI renders these in a calmer color than real failures.
 */
export type PipelineJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface ActiveStageJob {
  stage: string;
  status: PipelineJobStatus;
  triggered_by: JobTriggerSource | string;
  queued_at: string;
  started_at: string | null;
  ended_at: string | null;
  /** Populated when status is 'failed' or 'skipped'; null otherwise. */
  error_message: string | null;
  /**
   * Owner of the run. Returned by the superuser cross-user endpoints
   * (history-all + active-all). Plain freelancer queries always show
   * the caller's own runs, so this can be missing/null in that case.
   */
  user_id?: number | string | null;
  logs: string[];
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
  active_stages: Record<string, ActiveStageJob>;
}

export interface PipelineHistoryEntry {
  stage: string;
  status: PipelineJobStatus;
  triggered_by: JobTriggerSource | string;
  queued_at: string;
  started_at: string | null;
  ended_at: string | null;
  /** Populated when status is 'failed' or 'skipped'; null otherwise. */
  error_message: string | null;
  /**
   * Owner of the run. Set by the cross-user superuser history view; for
   * a freelancer's own ?user_id=me view this can be missing/null.
   */
  user_id?: number | string | null;
  logs: string[];
}

export interface PipelineHistoryResponse {
  history: PipelineHistoryEntry[];
  limit: number;
  offset: number;
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

// Freelancer pipeline production status
export type FreelancerProductionStatus = 'RUN' | 'HOLD';

export interface FreelancerStatusResponse {
  user_id: number;
  production_status: FreelancerProductionStatus;
  global_production_status: FreelancerProductionStatus;
  freelancers?: Array<{
    user_id: number;
    email: string;
    production_status: FreelancerProductionStatus;
  }>;
}

export interface FreelancerStatusUpdate {
  production_status: FreelancerProductionStatus;
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
  // Directory Privacy
  is_private_override?: boolean;
  is_public?: boolean;
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

export interface TriggerPipelineResponse {
  status: string;
  stage: string;
  stages: string[];
  triggered_at: string;
  active_stages: Record<string, ActiveStageJob>;
}

/**
 * Manually triggers a specific pipeline stage by slug (default: 'all').
 * Returns the current active_stages snapshot for instant UI update.
 */
export const triggerPipeline = (stage: PipelineStage = 'all') =>
  client.post<TriggerPipelineResponse>('/api/v1/pipeline/trigger', { stage }).then((r) => r.data);

/**
 * Fetches persistent pipeline job run history for the log panel.
 */
export const getPipelineHistory = (limit = 50, offset = 0) =>
  client.get<PipelineHistoryResponse>('/api/v1/pipeline/history', { params: { limit, offset } }).then((r) => r.data);

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

// Freelancer Per-Job Config
export type JobEffectiveStatus = 'RUN' | 'HOLD';

export interface FreelancerJobConfigRow {
  job_id: string;
  type: string | null;
  hour: number | null;
  minute: number | null;
  minutes: number | null;
  day_of_week: string | null;
  global_status: JobEffectiveStatus;
  freelancer_status: JobEffectiveStatus;
  effective_status: JobEffectiveStatus;
  system_only: boolean;
}

export interface FreelancerJobConfigResponse {
  user_id: number;
  global_production_status: JobEffectiveStatus;
  jobs: FreelancerJobConfigRow[];
}

/**
 * Get the current freelancer's effective job configuration (global merged with personal overrides).
 */
export const getMyJobConfig = () =>
  client.get<FreelancerJobConfigResponse>('/api/v1/pipeline/my-job-config').then((r) => r.data);

/**
 * Update the current freelancer's personal per-job overrides.
 */
export const updateMyJobConfig = (updates: Record<string, JobEffectiveStatus>) =>
  client
    .patch<FreelancerJobConfigResponse>('/api/v1/pipeline/my-job-config', updates)
    .then((r) => r.data);

/**
 * Admin: fetch a specific freelancer's job configuration view.
 */
export const getFreelancerJobConfigAdmin = (userId: number) =>
  client
    .get<FreelancerJobConfigResponse>(`/api/v1/pipeline/freelancer-job-config/${userId}`)
    .then((r) => r.data);

/**
 * Admin: set a specific freelancer's per-job overrides.
 */
export const updateFreelancerJobConfigAdmin = (
  userId: number,
  updates: Record<string, JobEffectiveStatus>,
) =>
  client
    .patch<FreelancerJobConfigResponse>(`/api/v1/pipeline/freelancer-job-config/${userId}`, updates)
    .then((r) => r.data);

// Per-freelancer notification preferences
export interface NotificationPrefsResponse {
  user_id: number;
  stages: string[];
  prefs: Record<string, boolean>;
}

/**
 * Fetch the current freelancer's per-job notification preferences.
 * Defaults to ``true`` (enabled) for stages without an explicit row.
 */
export const getMyNotificationConfig = () =>
  client
    .get<NotificationPrefsResponse>('/api/v1/pipeline/my-notification-config')
    .then((r) => r.data);

/**
 * Update the current freelancer's per-job notification preferences.
 * Each value must be a boolean — true enables notifications, false silences.
 */
export const updateMyNotificationConfig = (prefs: Record<string, boolean>) =>
  client
    .patch<NotificationPrefsResponse>('/api/v1/pipeline/my-notification-config', { prefs })
    .then((r) => r.data);

// Freelancer Pipeline Status
/**
 * Gets the current freelancer's pipeline production status.
 * Superusers also receive all freelancer statuses.
 */
export const getFreelancerStatus = () =>
  client.get<FreelancerStatusResponse>('/api/v1/pipeline/freelancer-status').then((r) => r.data);

/**
 * Updates the current freelancer's pipeline production status (RUN/HOLD).
 */
export const updateFreelancerStatus = (payload: FreelancerStatusUpdate) =>
  client.patch<{ user_id: number; production_status: string }>('/api/v1/pipeline/freelancer-status', payload).then((r) => r.data);

/**
 * Admin: Updates a specific freelancer's pipeline production status.
 */
export const updateFreelancerStatusAdmin = (userId: number, payload: FreelancerStatusUpdate) =>
  client.patch<{ user_id: number; production_status: string }>(`/api/v1/pipeline/freelancer-status/${userId}`, payload).then((r) => r.data);

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

// ── Per-lead manual outreach ──────────────────────────────────────────────

/**
 * Possible UI states for the per-lead "Send Now" button. Mirrors the
 * backend's ``_build_outreach_state_payload`` decision tree.
 */
export type LeadOutreachButtonState =
  | 'eligible'      // qualified email lead — Run button is active
  | 'in_flight'     // a manual job is queued or running for this lead
  | 'locked'        // status has moved past qualified — needs Unlock first
  | 'failed'        // last manual run failed — user can retry directly
  | 'phone_only'    // phone-qualified — render WhatsApp link instead
  | 'not_eligible'; // anything else (discovered, qualification_error, …)

export interface LeadOutreachState {
  lead_id: string;
  lead_status: string;
  button_state: LeadOutreachButtonState;
  manual_status: 'queued' | 'running' | 'completed' | 'failed' | null;
  manual_error: string | null;
  queued_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  queue_position: number | null;
  has_email: boolean;
  has_phone: boolean;
}

export interface LeadWhatsappLink {
  lead_id: string;
  phone_digits: string;
  url: string;
  message: string;
  cached?: boolean;
  generated_at?: string;
}

/**
 * Reads the per-lead outreach button state.
 */
export const getLeadOutreachState = (leadId: string) =>
  client
    .get<LeadOutreachState>(`/api/v1/leads/${leadId}/outreach-state`)
    .then((r) => r.data);

/**
 * Enqueues a single-lead personalization + outreach job behind any other
 * pipeline jobs already running on the shared serial queue.
 */
export const triggerLeadOutreach = (leadId: string) =>
  client
    .post<LeadOutreachState>(`/api/v1/leads/${leadId}/trigger-outreach`)
    .then((r) => r.data);

/**
 * Resets a lead's status back to ``qualified`` so its outreach button can
 * be triggered again. Cannot be called while a manual job is in flight.
 */
export const unlockLeadOutreach = (leadId: string) =>
  client
    .post<LeadOutreachState>(`/api/v1/leads/${leadId}/unlock-outreach`)
    .then((r) => r.data);

/**
 * Runs personalization for a phone-qualified lead and returns a wa.me deep
 * link with the generated message body. The backend caches the message in
 * Redis for 24h; pass ``regenerate=true`` to force a fresh Groq call.
 *
 * Slow path: first call per lead can take several seconds (Groq + optional
 * website enrichment). Frontend should show a loading state while pending.
 */
export const triggerLeadWhatsappOutreach = (leadId: string, regenerate = false) =>
  client
    .post<LeadWhatsappLink>(
      `/api/v1/leads/${leadId}/whatsapp-link`,
      null,
      { params: { regenerate }, timeout: 90_000 },
    )
    .then((r) => r.data);

/** Backwards-compat alias — preferred call site is ``triggerLeadWhatsappOutreach``. */
export const getLeadWhatsappLink = (leadId: string) =>
  triggerLeadWhatsappOutreach(leadId, false);

export const invalidateLeadWhatsappCache = (leadId: string) =>
  client
    .post<{ lead_id: string; invalidated: boolean }>(
      `/api/v1/leads/${leadId}/whatsapp-link/invalidate`,
    )
    .then((r) => r.data);

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

// ── Advanced Analytics ─────────────────────────────────────────────────────

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface FunnelConversions {
  discovered_to_qualified: number;
  qualified_to_sent: number;
  sent_to_opened: number;
  opened_to_clicked: number;
  opened_to_replied: number;
  sent_to_replied: number;
}

export interface FunnelTotals {
  discovered: number;
  qualified: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

export interface FunnelResponse {
  window_days: number;
  totals: FunnelTotals;
  stages: FunnelStage[];
  conversions: FunnelConversions;
}

export interface NicheRow {
  category: string;
  discovered: number;
  sent: number;
  opened: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

export interface TimingPeak {
  weekday: number;
  hour: number;
  count: number;
}

export interface TimingResponse {
  window_days: number;
  weekday_labels: string[];
  opens: number[][];
  replies: number[][];
  peak_open: TimingPeak | null;
  peak_reply: TimingPeak | null;
}

export interface VolumePoint {
  date: string;
  emails_sent: number;
  emails_opened: number;
  replies_received: number;
  leads_found: number;
  open_rate: number;
  reply_rate: number;
}

export interface SentimentBucket {
  key: 'positive' | 'neutral' | 'negative' | 'unsubscribe';
  label: string;
  count: number;
  share: number;
}

export interface SentimentResponse {
  window_days: number;
  total_replies: number;
  buckets: SentimentBucket[];
}

export interface AdviceResponse {
  bullets: string[];
  metrics: unknown;
  source: 'groq' | 'fallback';
}

export const getFunnelStats = (days = 30) =>
  client
    .get<FunnelResponse>('/api/v1/analytics/funnel', { params: { days } })
    .then((r) => r.data);

export const getNichePerformance = (days = 90) =>
  client
    .get<NicheRow[]>('/api/v1/analytics/niches', { params: { days } })
    .then((r) => r.data);

export const getTimingInsights = (days = 60) =>
  client
    .get<TimingResponse>('/api/v1/analytics/timing', { params: { days } })
    .then((r) => r.data);

export const getVolumeSeries = (days = 30) =>
  client
    .get<VolumePoint[]>('/api/v1/analytics/volume', { params: { days } })
    .then((r) => r.data);

export const getSentimentBreakdown = (days = 30) =>
  client
    .get<SentimentResponse>('/api/v1/analytics/sentiment', { params: { days } })
    .then((r) => r.data);

export const getWeeklyAdvice = () =>
  client
    .get<AdviceResponse>('/api/v1/analytics/advice', { timeout: 60_000 })
    .then((r) => r.data);

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
  booking_url?: string | null;
  meeting_link?: string | null;
  booking_confirmation_mode?: 'auto' | 'manual';
  scheduling_preferences?: SchedulingPrefs;
  is_public: boolean;
  show_rates: boolean;
  show_availability: boolean;
  include_profile_signature: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkingPeriod {
  start: string;
  end: string;
}

export interface SchedulingPrefs {
  working_hours?: Record<string, WorkingPeriod[]>;
  timezone?: string;
  is_closed?: boolean;
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
  booking_url?: string;
  meeting_link?: string;
  booking_confirmation_mode?: 'manual' | 'auto';
  is_public?: boolean;
  show_rates?: boolean;
  show_availability?: boolean;
  include_profile_signature?: boolean;
  scheduling_preferences?: SchedulingPrefs;
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

export interface PublicVerificationItem {
  field_name: string;
  status: 'verified' | 'failed' | 'pending' | 'expired';
  verified_at?: string | null;
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
  verifications?: PublicVerificationItem[] | null;
  member_since?: string | null;
}

export interface VerificationStatusItem {
  field_name: string;
  field_value: string;
  status: 'pending' | 'verified' | 'failed' | 'expired';
  method?: string | null;
  failure_reason?: string | null;
  verified_at?: string | null;
  expires_at?: string | null;
  updated_at: string;
}

export interface VerificationStatusResponse {
  verifications: VerificationStatusItem[];
  verified_count: number;
  total_count: number;
}

export interface VerifyResultResponse {
  results: VerificationStatusItem[];
  message: string;
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

// Verification
export const verifyProfileFields = (fields: string[]) =>
  client.post<VerifyResultResponse>('/api/v1/profile/me/verify', { fields }).then((r) => r.data);

export const getVerificationStatus = () =>
  client.get<VerificationStatusResponse>('/api/v1/profile/me/verification-status').then((r) => r.data);

// ── Discovery Targets (per-freelancer manual override) ──────────

export type DiscoveryDepth = 'sub_area' | 'city' | 'region' | 'country';

export interface DiscoveryTarget {
  country?: string | null;
  country_code?: string | null;
  region?: string | null;
  city: string;
  sub_area?: string | null;
  category: string;
  location_depth: DiscoveryDepth;
  max_results: number;
}

export interface DiscoveryConfig {
  auto_mode_enabled: boolean;
  pinned_targets: DiscoveryTarget[];
  total_max_results: number;
  batch_limit: number;
  max_targets: number;
  updated_at: string | null;
}

export interface DiscoveryConfigUpdate {
  auto_mode_enabled: boolean;
  pinned_targets: DiscoveryTarget[];
}

export interface DiscoveryLimits {
  batch_limit: number;
  max_targets: number;
  min_results_per_target: number;
  allowed_depths: DiscoveryDepth[];
  depth_radius_km: Record<DiscoveryDepth, number>;
}

export interface DiscoveryHistoryEntry {
  id: string;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string;
  sub_area: string | null;
  category: string;
  location_depth: string;
  results_count: number;
  created_at: string;
}

export type DiscoveryPreviewMode = 'auto' | 'manual' | 'auto_fallback';

export interface DiscoveryPreviewTarget {
  source: 'manual' | 'auto';
  city: string;
  category: string;
  sub_area?: string | null;
  region?: string | null;
  country?: string | null;
  country_code?: string | null;
  location_depth: string;
  max_results?: number | null;
}

export interface DiscoveryPreview {
  mode: DiscoveryPreviewMode;
  note?: string | null;
  targets: DiscoveryPreviewTarget[];
}

export const getDiscoveryConfig = () =>
  client.get<DiscoveryConfig>('/api/v1/discovery-config').then((r) => r.data);

export const updateDiscoveryConfig = (payload: DiscoveryConfigUpdate) =>
  client.put<DiscoveryConfig>('/api/v1/discovery-config', payload).then((r) => r.data);

export const getDiscoveryLimits = () =>
  client.get<DiscoveryLimits>('/api/v1/discovery-config/limits').then((r) => r.data);

export const getDiscoveryCategories = () =>
  client
    .get<{ categories: string[] }>('/api/v1/discovery-config/categories')
    .then((r) => r.data.categories);

export const getDiscoveryHistory = (days = 60) =>
  client
    .get<DiscoveryHistoryEntry[]>('/api/v1/discovery-config/history', { params: { days } })
    .then((r) => r.data);

export const deleteDiscoveryHistoryEntry = (id: string) =>
  client.delete(`/api/v1/discovery-config/history/${id}`).then((r) => r.data);

export const clearAllDiscoveryHistory = () =>
  client.delete<{ deleted: number }>('/api/v1/discovery-config/history').then((r) => r.data);

export const previewDiscoveryRun = () =>
  client.get<DiscoveryPreview>('/api/v1/discovery-config/preview').then((r) => r.data);

// ── Notifications (in-app feed + Web Push / FCM subscriptions) ──

export type NotificationKind =
  | 'stage_started'
  | 'stage_progress'
  | 'stage_finished'
  | 'stage_failed'
  | 'app_update'
  | 'system';

export interface NotificationItem {
  id: number;
  kind: NotificationKind | string;
  title: string;
  body?: string | null;
  url?: string | null;
  icon?: string | null;
  payload?: Record<string, unknown> | null;
  group_key?: string | null;
  created_at: string;
  read_at?: string | null;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread_count: number;
  server_time: string;
}

export interface NotificationsConfig {
  vapid_public_key: string;
  web_push_enabled: boolean;
  fcm_enabled: boolean;
}

export interface PushSubscriptionRead {
  id: number;
  platform: 'web' | 'android';
  endpoint_preview: string;
  label?: string | null;
  user_agent?: string | null;
  created_at: string;
  last_used_at: string;
}

export interface SubscribeRequest {
  platform: 'web' | 'android';
  endpoint: string;
  keys?: { p256dh: string; auth: string };
  user_agent?: string;
  label?: string;
}

export const getNotificationsConfig = () =>
  client.get<NotificationsConfig>('/api/v1/notifications/config').then((r) => r.data);

export const getNotifications = (params?: {
  limit?: number;
  only_unread?: boolean;
  since_id?: number;
}) =>
  client
    .get<NotificationFeed>('/api/v1/notifications', { params })
    .then((r) => r.data);

export const markNotificationRead = (id: number) =>
  client.post(`/api/v1/notifications/${id}/read`).then(() => undefined);

export const markAllNotificationsRead = () =>
  client.post('/api/v1/notifications/read-all').then(() => undefined);

export const deleteNotification = (id: number) =>
  client.delete(`/api/v1/notifications/${id}`).then(() => undefined);

export const clearAllNotifications = () =>
  client.delete('/api/v1/notifications').then(() => undefined);

export const sendTestNotification = (payload?: { title?: string; body?: string }) =>
  client
    .post<NotificationItem>('/api/v1/notifications/test', payload || {})
    .then((r) => r.data);

export const listPushSubscriptions = () =>
  client.get<PushSubscriptionRead[]>('/api/v1/notifications/subscriptions').then((r) => r.data);

export const subscribePush = (payload: SubscribeRequest) =>
  client.post<PushSubscriptionRead>('/api/v1/notifications/subscribe', payload).then((r) => r.data);

export const unsubscribePushByEndpoint = (endpoint: string) =>
  client
    .delete('/api/v1/notifications/subscribe', { params: { endpoint } })
    .then(() => undefined);

export const deletePushSubscription = (id: number) =>
  client.delete(`/api/v1/notifications/subscriptions/${id}`).then(() => undefined);

// ── Public Lead Scanner (lead-magnet) ──

export type ScanFlawSeverity = 'critical' | 'warning' | 'info';

export interface ScanFlaw {
  code: string;
  title: string;
  detail: string;
  severity: ScanFlawSeverity;
}

export interface ScanSocial {
  platform: string;
  url: string;
}

export interface ScanResult {
  url: string;
  normalized_url: string;
  is_dns_valid: boolean;
  is_http_valid: boolean;
  has_ssl: boolean;
  is_mobile_friendly: boolean;
  is_free_builder: boolean;
  copyright_year: number | null;
  has_socials: boolean;
  socials: ScanSocial[];
  flaws: ScanFlaw[];
  score: number;
}

/**
 * Public scanner — no auth required. The endpoint is rate-limited
 * server-side (10/min/IP via slowapi); a 429 response should be
 * surfaced verbatim to the user as a "try again in a moment" toast.
 */
export const scanWebsite = (url: string) =>
  client
    .post<ScanResult>('/api/v1/public/scan-website', { url }, { timeout: 30_000 })
    .then((r) => r.data);

/* ───────────────────────────── Deep audit ────────────────────────────── */

export type AuditCategory =
  | 'indexability'
  | 'meta'
  | 'headings'
  | 'content'
  | 'schema'
  | 'performance'
  | 'mobile'
  | 'accessibility'
  | 'trust'
  | 'aeo';

export type AuditSeverity = 'critical' | 'warning' | 'info' | 'good';

export type AuditImpact = 'high' | 'medium' | 'low';

export interface AuditFinding {
  category: AuditCategory;
  code: string;
  title: string;
  detail: string;
  suggestion: string;
  severity: AuditSeverity;
  impact: AuditImpact;
}

export interface AuditCategoryScore {
  category: AuditCategory;
  score: number;
  headline: string;
  findings_count: number;
}

export type AuditGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface DeepAudit {
  url: string;
  normalized_url: string;
  final_url: string;
  fetched_at_iso: string;
  is_dns_valid: boolean;
  is_http_valid: boolean;
  http_status: number | null;
  final_redirect_chain: string[];
  page_title: string | null;
  meta_description: string | null;
  canonical: string | null;
  has_ssl: boolean;
  overall_score: number;
  grade: AuditGrade;
  summary: string;
  category_scores: AuditCategoryScore[];
  findings: AuditFinding[];
  detected_schemas: string[];
  open_graph: Record<string, string>;
  twitter: Record<string, string>;
  word_count: number;
  image_count: number;
  image_without_alt_count: number;
  internal_link_count: number;
  external_link_count: number;
  has_robots_txt: boolean;
  has_sitemap_referenced: boolean;
  has_llms_txt: boolean;
}

/**
 * Run the deep website audit. Server-side rate limit: 5/min/IP.
 */
export const auditWebsite = (url: string) =>
  client
    .post<DeepAudit>('/api/v1/public/audit-website', { url }, { timeout: 45_000 })
    .then((r) => r.data);

/* ───────────────────────────── Maps audit ────────────────────────────── */

export interface BusinessReview {
  author_name: string | null;
  author_uri: string | null;
  author_photo_uri: string | null;
  rating: number | null;
  relative_time: string | null;
  publish_time: string | null;
  text: string | null;
  original_text: string | null;
}

export interface AmenityFlags {
  delivery: boolean | null;
  takeout: boolean | null;
  dine_in: boolean | null;
  curbside_pickup: boolean | null;
  reservable: boolean | null;
  serves_breakfast: boolean | null;
  serves_lunch: boolean | null;
  serves_dinner: boolean | null;
  serves_brunch: boolean | null;
  serves_beer: boolean | null;
  serves_wine: boolean | null;
  serves_cocktails: boolean | null;
  serves_coffee: boolean | null;
  serves_dessert: boolean | null;
  serves_vegetarian_food: boolean | null;
  good_for_children: boolean | null;
  good_for_groups: boolean | null;
  good_for_watching_sports: boolean | null;
  allows_dogs: boolean | null;
  live_music: boolean | null;
  menu_for_children: boolean | null;
  outdoor_seating: boolean | null;
  restroom: boolean | null;
}

export interface AccessibilityOptions {
  wheelchair_accessible_parking: boolean | null;
  wheelchair_accessible_entrance: boolean | null;
  wheelchair_accessible_restroom: boolean | null;
  wheelchair_accessible_seating: boolean | null;
}

export interface ParkingOptions {
  free_parking_lot: boolean | null;
  paid_parking_lot: boolean | null;
  free_street_parking: boolean | null;
  paid_street_parking: boolean | null;
  valet_parking: boolean | null;
  free_garage_parking: boolean | null;
  paid_garage_parking: boolean | null;
}

export interface PaymentOptions {
  accepts_credit_cards: boolean | null;
  accepts_debit_cards: boolean | null;
  accepts_cash_only: boolean | null;
  accepts_nfc: boolean | null;
}

/**
 * Profile derived from a Google Maps Places API response. Distinct from the
 * separate `BusinessProfile` (signup-time data) earlier in this file — this
 * one only carries fields the Places API exposes.
 */
export interface MapsBusinessProfile {
  place_id: string;
  display_name: string | null;
  short_formatted_address: string | null;
  formatted_address: string | null;
  adr_format_address: string | null;
  primary_type: string | null;
  primary_type_raw: string | null;
  types: string[];
  phone: string | null;
  national_phone: string | null;
  international_phone: string | null;
  website_uri: string | null;
  google_maps_uri: string | null;
  place_uri: string | null;
  write_a_review_uri: string | null;
  rating: number | null;
  user_rating_count: number | null;
  business_status: string | null;
  price_level: string | null;
  price_range_start: string | null;
  price_range_end: string | null;
  latitude: number | null;
  longitude: number | null;
  viewport_low_lat: number | null;
  viewport_low_lng: number | null;
  viewport_high_lat: number | null;
  viewport_high_lng: number | null;
  plus_code_global: string | null;
  plus_code_compound: string | null;
  weekday_descriptions: string[];
  secondary_hours_descriptions: string[];
  open_now: boolean | null;
  next_open_close_time: string | null;
  photo_count: number;
  photo_thumbnails: string[];
  photo_attributions: string[];
  editorial_summary: string | null;
  generative_summary: string | null;
  review_summary: string | null;
  area_summary: string | null;
  icon_mask_base_uri: string | null;
  icon_background_color: string | null;
  reviews: BusinessReview[];
  country: string | null;
  region: string | null;
  city: string | null;
  neighborhood: string | null;
  sublocality: string | null;
  route: string | null;
  street_number: string | null;
  postal_code: string | null;
  utc_offset_minutes: number | null;
  amenities: AmenityFlags;
  accessibility: AccessibilityOptions;
  parking: ParkingOptions;
  payments: PaymentOptions;
  sub_destinations: Array<Record<string, unknown>>;
  attributions: string[];
  pure_service_area_business: boolean | null;
}

export interface PlaceMetrics {
  profile_completeness_pct: number;
  nap_completeness_pct: number;
  photo_coverage_pct: number;
  amenity_disclosure_pct: number;
  accessibility_disclosure_pct: number;
  review_response_rate_pct: number | null;
  avg_review_length_chars: number;
  days_since_latest_review: number | null;
  days_since_oldest_review: number | null;
  estimated_review_velocity_per_month: number;
  rating_percentile_estimate: number | null;
  local_pack_eligible: boolean;
  is_top_rated: boolean;
  is_low_rated: boolean;
  is_new_listing: boolean;
  sentiment_proxy_pct: number;
}

export interface PlaceCategoryScore {
  category: 'reviews' | 'profile' | 'photos' | 'engagement' | 'discoverability';
  score: number;
  headline: string;
  detail: string;
}

export interface PlaceScorecard {
  overall_score: number;
  grade: AuditGrade;
  summary: string;
  categories: PlaceCategoryScore[];
}

export interface BenchmarkSnapshot {
  category_label: string;
  review_benchmark: number;
  star_benchmark: number;
  review_gap: number;
  star_gap: number;
}

export interface DerivedRecommendation {
  code: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MapsAuditResponse {
  place_id: string;
  fetched_at_iso: string;
  business: MapsBusinessProfile;
  website_audit: DeepAudit | null;
  socials_found: boolean;
  socials: ScanSocial[];
  derived_findings: AuditFinding[];
  recommendations: DerivedRecommendation[];
  metrics: PlaceMetrics;
  scorecard: PlaceScorecard;
  benchmark: BenchmarkSnapshot;
}

export interface AuditAccessResponse {
  allowed: boolean;
  plan: string;
  reason: string;
}

/**
 * Pro/Enterprise check before showing the input. Returns 401/403 when not
 * logged in — callers should surface that as "log in" rather than a hard
 * error toast.
 */
export const getAuditAccess = () =>
  client
    .get<AuditAccessResponse>('/api/v1/audit/access')
    .then((r) => r.data);

/**
 * Audit a Google Maps share URL, place_id, or business name. Requires login
 * + an active Pro/Enterprise plan. Server-side rate limit: 20/min/IP.
 */
export const auditPlace = (mapsUrl: string) =>
  client
    .post<MapsAuditResponse>(
      '/api/v1/audit/place',
      { maps_url: mapsUrl },
      { timeout: 60_000 },
    )
    .then((r) => r.data);

// ── Public Lead Directory ─────────────────────────────────────────────────────

export interface DirectoryLocation {
  city: string;
  region: string | null;
  state: string | null;
  country: string | null;
  country_code: string | null;
  lead_count: number;
}

export interface DirectoryLocationList {
  locations: DirectoryLocation[];
  total_locations: number;
}

export interface DirectoryLeadSummary {
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  country: string | null;
  rating: number | null;
  review_count: number | null;
  ai_score_tier: string;
  has_website: boolean;
  website_url: string | null;
  google_maps_url: string | null;
  discovered_at: string | null;
}

export interface DirectoryLeadDetail {
  slug: string;
  business_name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  review_count: number | null;
  ai_score_tier: string;
  has_website: boolean;
  website_url: string | null;
  google_maps_url: string | null;
  is_mobile_responsive: boolean | null;
  has_online_booking: boolean | null;
  has_ecommerce: boolean | null;
  has_social_media: boolean;
  website_title: string | null;
  discovered_at: string | null;
}

export interface DirectoryListResponse {
  leads: DirectoryLeadSummary[];
  total: number;
  page: number;
  pages: number;
  industry: string;
  city: string;
}

/**
 * Fetches grouped locations with public lead counts for the directory index.
 * Public endpoint — no authentication required.
 */
export const getDirectoryLocations = (country?: string) =>
  client
    .get<DirectoryLocationList>('/api/v1/directory/locations', {
      params: country ? { country } : undefined,
    })
    .then((r) => r.data);

/**
 * Fetches paginated public leads for a given industry and city.
 * Public endpoint — no authentication required.
 */
export const getDirectoryList = (
  industry: string,
  city: string,
  page = 1,
  limit = 20,
) =>
  client
    .get<DirectoryListResponse>(`/api/v1/directory/${industry}/${city}`, {
      params: { page, limit },
    })
    .then((r) => r.data);

/**
 * Fetches detailed public-safe data for a single lead by slug.
 * Public endpoint — no authentication required.
 */
export const getDirectoryLead = (slug: string) =>
  client
    .get<DirectoryLeadDetail>(`/api/v1/directory/lead/${slug}`)
    .then((r) => r.data);

export interface DirectoryIndustry {
  category: string;
  slug: string;
  lead_count: number;
}

export interface DirectoryIndustryList {
  industries: DirectoryIndustry[];
  total_industries: number;
}

export interface DirectoryStats {
  total_leads: number;
  total_cities: number;
  total_industries: number;
  total_countries: number;
  top_industries: DirectoryIndustry[];
  top_locations: DirectoryLocation[];
}

/**
 * Fetches grouped industry categories with lead counts.
 * Public endpoint — no authentication required.
 */
export const getDirectoryIndustries = (city?: string) =>
  client
    .get<DirectoryIndustryList>('/api/v1/directory/industries', {
      params: city ? { city } : undefined,
    })
    .then((r) => r.data);

/**
 * Fetches high-level directory statistics.
 * Public endpoint — no authentication required.
 */
export const getDirectoryStats = () =>
  client
    .get<DirectoryStats>('/api/v1/directory/stats')
    .then((r) => r.data);

// ── Native Booking ──────────────────────────────────────────────────────────

export interface BookingSlotResponse {
  slots: string[];
  freelancer_timezone: string;
  is_closed?: boolean;
}

export const getBookingSlots = (username: string, startDate: string, endDate: string, duration: number = 30, visitorTimezone?: string) =>
  client.get<BookingSlotResponse>(`/api/v1/book/${username}/slots`, {
    params: { start_date: startDate, end_date: endDate, duration, visitor_timezone: visitorTimezone }
  }).then(r => r.data);

export interface CreateBookingRequest {
  guest_name: string;
  guest_email: string;
  guest_notes?: string;
  start_time: string;
  duration_minutes: number;
  event_slug?: string;
}

export const createNativeBooking = (username: string, payload: CreateBookingRequest) =>
  client.post(`/api/v1/book/${username}`, payload).then(r => r.data);

export const getMyBookings = () =>
  client.get('/api/v1/bookings/').then(r => r.data);

export const approveBooking = (id: number) =>
  client.post(`/api/v1/bookings/${id}/approve`).then(r => r.data);

export const rejectBooking = (id: number) =>
  client.post(`/api/v1/bookings/${id}/reject`).then(r => r.data);

export const cancelBooking = (id: number) =>
  client.post(`/api/v1/bookings/${id}/cancel`).then(r => r.data);

export interface CustomBookingRequest {
  guest_name: string;
  guest_email: string;
  guest_notes?: string;
  proposed_times: string;
}

export const requestCustomTime = (username: string, payload: CustomBookingRequest) =>
  client.post(`/api/v1/book/${username}/custom-request`, payload).then(r => r.data);

export interface ManualBlockRequest {
  title: string;
  start_time: string;
  end_time: string;
}

export const createManualBlock = (payload: ManualBlockRequest) =>
  client.post(`/api/v1/bookings/manual-block`, payload).then(r => r.data);

export interface InstantMeetingRequest {
  guest_name: string;
  guest_email: string;
  title: string;
  description?: string;
  duration_minutes: number;
  start_time?: string;
}

export const createInstantMeeting = (payload: InstantMeetingRequest) =>
  client.post(`/api/v1/bookings/instant`, payload).then(r => r.data);

// ── Event Types ──────────────────────────────────────────────────────────────

export interface EventTypeItem {
  id: number;
  title: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  color: string | null;
  is_active: boolean;
  created_at?: string | null;
}

export interface EventTypesResponse {
  event_types: EventTypeItem[];
  has_custom?: boolean;
}

export interface EventTypeCreateRequest {
  title: string;
  slug: string;
  duration_minutes: number;
  description?: string;
  color?: string;
}

export interface EventTypeUpdateRequest {
  title?: string;
  slug?: string;
  duration_minutes?: number;
  description?: string;
  color?: string;
  is_active?: boolean;
}

/** Public: list a freelancer's active event types (no auth). */
export const getPublicEventTypes = (username: string) =>
  client.get<EventTypesResponse>(`/api/v1/book/${username}/events`).then(r => r.data);

/** Private: list the current freelancer's event types (authed). */
export const getMyEventTypes = () =>
  client.get<EventTypesResponse>('/api/v1/bookings/event-types').then(r => r.data);

export const createEventType = (payload: EventTypeCreateRequest) =>
  client.post('/api/v1/bookings/event-types', payload).then(r => r.data);

export const updateEventType = (id: number, payload: EventTypeUpdateRequest) =>
  client.put(`/api/v1/bookings/event-types/${id}`, payload).then(r => r.data);

export const deleteEventType = (id: number) =>
  client.delete(`/api/v1/bookings/event-types/${id}`).then(r => r.data);
