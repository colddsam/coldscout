/**
 * Backend API Client & Core Data Models.
 * 
 * Provides a type-safe interface for the AI Lead Generation backend.
 * Handles authentication header injection, session lifecycle management via 
 * axios interceptors, and error normalization.
 */
import axios from 'axios';

/**
 * Core Axios configuration.
 * Manages base URL, timeouts, and shared security headers.
 */
const API_KEY = import.meta.env.VITE_API_KEY;

export const client = axios.create({
  baseURL: import.meta.env.VITE_PROXY_URL || '',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});

// Request interceptor: Injects JWT and X-API-Key for authenticated routes.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('llp_token');
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
  (err) => {
    // Handle credential failure specifically. We check the detail message
    // to distinguish between session expiry (JWT) and system config errors (API Key).
    const isSessionError = err.response?.status === 401 || 
      (err.response?.status === 403 && err.response?.data?.detail === "Could not validate credentials");

    if (isSessionError) {
      // Clear local storage immediately to prevent further unauthorized requests
      localStorage.removeItem('llp_token');
      localStorage.removeItem('llp_user');
      
      const path = window.location.pathname;
      // Signal session expiration if the user is in a protected area.
      if (path !== '/login' && path !== '/') {
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
export type LeadStatus = 'discovered' | 'qualified' | 'contacted' | 'replied' | 'closed' | 'rejected' | 'email_sent';
export type IntentLabel = 'interested' | 'pricing_inquiry' | 'not_interested' | 'unsubscribe' | 'other';
export type PipelineStage = 'discovery' | 'qualification' | 'personalization' | 'outreach' | 'report' | 'optimization' | 'all';

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
  website: string | null;
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
  client.patch<{ status: string; config: JobsConfig }>('/api/v1/pipeline/jobs_config', config).then((r) => r.data);

// Leads
/**
 * Retrieves paginated leads with support for geographic and status-based filtering.
 */
export const getLeads = (params: {
  page?: number;
  limit?: number;
  status?: string;
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

export const exportLeadsCsv = (params?: { status?: string; city?: string }) =>
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
