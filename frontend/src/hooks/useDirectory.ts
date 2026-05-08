/**
 * useDirectory — TanStack Query hooks for the Public Lead Directory.
 *
 * Wraps the three directory API endpoints with appropriate stale times
 * and caching strategies. Directory data is relatively static so we
 * use longer stale times (5 min) to reduce backend load from repeat visits.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getDirectoryLocations,
  getDirectoryList,
  getDirectoryLead,
  getDirectoryIndustries,
  getDirectoryStats,
} from '../lib/api';
import type {
  DirectoryLocationList,
  DirectoryListResponse,
  DirectoryLeadDetail,
  DirectoryIndustryList,
  DirectoryStats,
} from '../lib/api';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches grouped locations with public lead counts.
 * Used by the DirectoryIndex page.
 */
export function useDirectoryLocations(country?: string) {
  return useQuery<DirectoryLocationList>({
    queryKey: ['directory-locations', country],
    queryFn: () => getDirectoryLocations(country),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches paginated public leads for a given industry and city.
 * Used by the DirectoryList page.
 */
export function useDirectoryList(
  industry: string,
  city: string,
  page = 1,
  limit = 20,
) {
  return useQuery<DirectoryListResponse>({
    queryKey: ['directory-list', industry, city, page, limit],
    queryFn: () => getDirectoryList(industry, city, page, limit),
    enabled: !!industry && !!city,
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches a single public lead by slug.
 * Used by the DirectoryDetail page.
 */
export function useDirectoryLead(slug: string) {
  return useQuery<DirectoryLeadDetail>({
    queryKey: ['directory-lead', slug],
    queryFn: () => getDirectoryLead(slug),
    enabled: !!slug,
    staleTime: STALE_TIME,
    retry: false,
  });
}

/**
 * Fetches grouped industry categories with lead counts.
 * Used by the DirectoryIndex page for industry chips.
 */
export function useDirectoryIndustries(city?: string) {
  return useQuery<DirectoryIndustryList>({
    queryKey: ['directory-industries', city],
    queryFn: () => getDirectoryIndustries(city),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches high-level directory statistics.
 * Used by the directory hero and landing page.
 */
export function useDirectoryStats() {
  return useQuery<DirectoryStats>({
    queryKey: ['directory-stats'],
    queryFn: () => getDirectoryStats(),
    staleTime: STALE_TIME,
  });
}
