import { useQuery } from '@tanstack/react-query';
import {
  getReports,
  getFunnelStats,
  getNichePerformance,
  getSentimentBreakdown,
  getTimingInsights,
  getVolumeSeries,
  getWeeklyAdvice,
} from '../lib/api';
import { useUserScope } from './useUserScope';

/**
 * Legacy daily-report list — kept for the table at the bottom of the
 * Analytics page that lets a freelancer download their per-day Excel
 * workbook.
 */
export function useAnalytics() {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics', scope],
    queryFn: getReports,
    enabled: scope !== 'anon',
  });
}

/**
 * Advanced analytics: funnel + conversions for the last N days.
 */
export function useFunnelStats(days = 30) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics-funnel', scope, days],
    queryFn: () => getFunnelStats(days),
    enabled: scope !== 'anon',
    staleTime: 60_000,
  });
}

/**
 * Per-niche (Lead.category) performance ranked by reply rate.
 */
export function useNichePerformance(days = 90) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics-niches', scope, days],
    queryFn: () => getNichePerformance(days),
    enabled: scope !== 'anon',
    staleTime: 5 * 60_000,
  });
}

/**
 * Weekday × hour heatmap of opens and replies.
 */
export function useTimingInsights(days = 60) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics-timing', scope, days],
    queryFn: () => getTimingInsights(days),
    enabled: scope !== 'anon',
    staleTime: 5 * 60_000,
  });
}

/**
 * Per-day outreach volume series for the area chart.
 */
export function useVolumeSeries(days = 30) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics-volume', scope, days],
    queryFn: () => getVolumeSeries(days),
    enabled: scope !== 'anon',
    staleTime: 60_000,
  });
}

/**
 * Reply sentiment aggregate (positive / neutral / negative / unsubscribe)
 * for the requested window.
 */
export function useSentimentBreakdown(days = 30) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics-sentiment', scope, days],
    queryFn: () => getSentimentBreakdown(days),
    enabled: scope !== 'anon',
    staleTime: 60_000,
  });
}

/**
 * Three-bullet Groq-generated weekly advice. Slow (LLM round-trip);
 * cached aggressively so the page doesn't pay the cost on every revisit.
 */
export function useWeeklyAdvice(enabled = true) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics-advice', scope],
    queryFn: getWeeklyAdvice,
    enabled: enabled && scope !== 'anon',
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}
