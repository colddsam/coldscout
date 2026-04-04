/**
 * Global Dashboard Constants.
 * Central registry for status mappings, navigation structures, and UI state labels.
 */
import type { LeadStatus, IntentLabel } from './api';

/**
 * Semantic color mapping for lead statuses.
 */
export const STATUS_COLORS: Record<string, string> = {
  discovered: 'amber',
  qualified: 'teal',
  contacted: 'teal',
  email_sent: 'teal',
  replied: 'green',
  closed: 'green',
  rejected: 'red',
};

export const STATUS_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  qualified: 'Qualified',
  contacted: 'Contacted',
  email_sent: 'Email Sent',
  replied: 'Replied',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const INTENT_COLORS: Record<IntentLabel, string> = {
  interested: 'green',
  pricing_inquiry: 'teal',
  not_interested: 'red',
  unsubscribe: 'red',
  other: 'amber',
};

export const INTENT_LABELS: Record<IntentLabel, string> = {
  interested: 'Interested',
  pricing_inquiry: 'Pricing Inquiry',
  not_interested: 'Not Interested',
  unsubscribe: 'Unsubscribe',
  other: 'Other',
};

export const PIPELINE_STAGES = [
  { id: 'discovery', label: 'Discovery', icon: 'Search', description: 'Discover new local business leads via Google Maps API' },
  { id: 'qualification', label: 'Qualification', icon: 'CheckCircle', description: 'AI-score and qualify leads based on business signals' },
  { id: 'personalization', label: 'Personalization', icon: 'Sparkles', description: 'Generate personalized pitches and email content' },
  { id: 'outreach', label: 'Outreach', icon: 'Send', description: 'Send personalized outreach emails with tracking' },
  { id: 'daily_report', label: 'Report', icon: 'BarChart2', description: 'Generate daily performance analytics report' },
  { id: 'weekly_optimization', label: 'Optimization', icon: 'TrendingUp', description: 'Run weekly AI optimization on email performance' },
] as const;

export const LEAD_STATUSES: LeadStatus[] = ['discovered', 'qualified', 'contacted', 'replied', 'closed', 'rejected', 'email_sent'];

export const NAV_ITEMS = [
  { path: '/overview', label: 'Overview', icon: 'LayoutDashboard', roles: ['freelancer'] },
  { path: '/pipeline', label: 'Pipeline', icon: 'GitBranch', roles: ['freelancer'] },
  { path: '/scheduler', label: 'Scheduler', icon: 'Clock', roles: ['freelancer'] },
  { path: '/leads', label: 'Leads CRM', icon: 'Users', roles: ['freelancer'] },
  { path: '/threads', label: 'Threads', icon: 'AtSign', roles: ['freelancer'] },
  { path: '/campaigns', label: 'Campaigns', icon: 'Send', roles: ['freelancer'] },
  { path: '/inbox', label: 'Smart Inbox', icon: 'Inbox', roles: ['freelancer'] },
  { path: '/analytics', label: 'Analytics', icon: 'BarChart2', roles: ['freelancer'] },
  { path: '/billing', label: 'Billing', icon: 'CreditCard', roles: ['freelancer'] },
  { path: '/profile', label: 'Profile', icon: 'User', roles: ['freelancer', 'client'] },
  { path: '/settings', label: 'Settings', icon: 'Settings', roles: ['freelancer'] },
] as const;
