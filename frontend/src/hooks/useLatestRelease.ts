/**
 * Latest Android Release hook.
 *
 * Polls the GitHub Releases API for the latest tag matching `android-v*`
 * (the tag pattern produced by the `android-build` workflow). Cached for
 * one hour and never throws on the consumer — failures simply resolve to
 * `null` so the UI can fall back gracefully.
 */
import { useQuery } from '@tanstack/react-query';

const GITHUB_REPO = 'colddsam/coldscout';
const RELEASES_ENDPOINT = `https://api.github.com/repos/${GITHUB_REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
}

export interface LatestRelease {
  tag: string;
  versionName: string;
  versionCode: number | null;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  apk: ReleaseAsset | null;
  aab: ReleaseAsset | null;
}

interface RawRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

function parseVersion(tag: string): { versionName: string; versionCode: number | null } {
  const stripped = tag.replace(/^android-v/i, '');
  const match = stripped.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { versionName: stripped || tag, versionCode: null };
  const patch = parseInt(match[3], 10);
  return {
    versionName: stripped,
    versionCode: Number.isFinite(patch) ? patch + 100 : null,
  };
}

async function fetchLatestAndroidRelease(): Promise<LatestRelease | null> {
  const res = await fetch(RELEASES_ENDPOINT, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    // 404 (no releases yet), 403 (rate-limited), etc. → no banner, no error toast.
    return null;
  }
  const releases = (await res.json()) as RawRelease[];
  const candidate = releases.find(
    (r) => !r.draft && !r.prerelease && /^android-v/i.test(r.tag_name),
  );
  if (!candidate) return null;

  const apk = candidate.assets.find((a) => a.name.toLowerCase().endsWith('.apk')) ?? null;
  const aab = candidate.assets.find((a) => a.name.toLowerCase().endsWith('.aab')) ?? null;
  const { versionName, versionCode } = parseVersion(candidate.tag_name);

  return {
    tag: candidate.tag_name,
    versionName,
    versionCode,
    publishedAt: candidate.published_at,
    htmlUrl: candidate.html_url,
    body: candidate.body ?? '',
    apk,
    aab,
  };
}

export function useLatestRelease() {
  return useQuery({
    queryKey: ['github', 'releases', 'android', GITHUB_REPO],
    queryFn: fetchLatestAndroidRelease,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: false,
  });
}
