import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes with clsx logic and tailwind-merge conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats ISO date strings to human-readable "MMM d, yyyy HH:mm".
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy HH:mm');
  } catch {
    return dateStr;
  }
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

/**
 * Returns a relative time string (e.g., "2 hours ago") for a given ISO date.
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-black font-bold';
  if (score >= 60) return 'text-gray-600';
  return 'text-gray-400';
}

export function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-black text-white border-black shadow-minimal';
  if (score >= 60) return 'bg-gray-100 text-black border-gray-300';
  return 'bg-white text-gray-400 border-gray-200';
}

/**
 * Truncates a string to a specified length and appends an ellipsis.
 */
export function truncate(text: string, maxLen: number = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

export function buildCronDescription(config: Record<string, unknown>): string {
  const parts: string[] = [];
  if (config.hour !== undefined) parts.push(`at ${String(config.hour).padStart(2, '0')}:${String(config.minute ?? 0).padStart(2, '0')}`);
  if (config.minutes !== undefined) parts.push(`every ${config.minutes} minutes`);
  if (config.day_of_week) parts.push(`on ${config.day_of_week}`);
  return parts.join(' ') || 'Custom schedule';
}

/**
 * Triggers a browser download for a raw Blob (e.g., CSV/PDF exports).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
