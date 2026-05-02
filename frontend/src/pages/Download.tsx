/**
 * Download page — public-facing entry point for the signed Android APK.
 *
 * Pulls the latest GitHub Release for the `android-v*` tag pattern and
 * exposes a single primary "Download APK" button plus release metadata.
 * Falls back gracefully when no release is available or the API errors.
 */
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  Smartphone, Download as DownloadIcon, ExternalLink, ShieldCheck, Calendar, Box,
} from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { PageLoader } from '../components/ui/Spinner';
import { useLatestRelease } from '../hooks/useLatestRelease';
import { useSEO } from '../hooks/useSEO';
import { formatDateShort } from '../lib/utils';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function notesExcerpt(body: string): string {
  if (!body) return '';
  const cleaned = body
    .replace(/^#+\s*/gm, '')
    .replace(/^\*\*(.*?)\*\*$/gm, '$1')
    .trim();
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(0, 8).join('\n');
}

export default function Download() {
  useSEO({
    title: 'Download App | Cold Scout',
    description: 'Download the latest signed Cold Scout Android app.',
    index: false,
  });

  const { data: release, isLoading, isError } = useLatestRelease();
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <PublicNavbar />
      <main className="flex-1 px-4 md:px-8 lg:px-16 pt-28 pb-16">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <PageLoader />
          ) : (
            <DownloadContents release={release} isError={isError} isAndroidNative={isAndroidNative} />
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

interface ContentsProps {
  release: ReturnType<typeof useLatestRelease>['data'];
  isError: boolean;
  isAndroidNative: boolean;
}

function DownloadContents({ release, isError, isAndroidNative }: ContentsProps) {
  return (
    <>
      <PageHeader
        title="Download App"
        subtitle="Cold Scout for Android — manage your pipeline on the go."
      />

      {(!release || isError) && <NoReleaseState errored={isError} />}

      {release && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid gap-4 md:grid-cols-3"
        >
          <Card className="md:col-span-2">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow mb-1">Android</p>
                <h3 className="text-lg font-semibold text-white tracking-tight truncate">
                  Cold Scout v{release.versionName}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary font-mono">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDateShort(release.publishedAt)}
                  </span>
                  {release.apk && (
                    <span className="inline-flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5" />
                      {formatBytes(release.apk.size)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-white/70">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Signed release
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {release.apk ? (
                <Button
                  variant="primary"
                  size="lg"
                  icon={<DownloadIcon />}
                  onClick={() => window.open(release.apk!.browser_download_url, '_blank', 'noopener')}
                >
                  Download APK
                </Button>
              ) : (
                <Button variant="secondary" size="lg" disabled>
                  APK not yet attached
                </Button>
              )}
              <Button
                variant="ghost"
                size="lg"
                icon={<ExternalLink />}
                onClick={() => window.open(release.htmlUrl, '_blank', 'noopener')}
              >
                Release notes
              </Button>
            </div>

            {!isAndroidNative && (
              <p className="mt-4 text-xs text-tertiary leading-relaxed">
                Android only — sideload by opening the downloaded APK on your device. iOS/desktop
                users can keep using the web dashboard.
              </p>
            )}
            {isAndroidNative && (
              <p className="mt-4 text-xs text-tertiary leading-relaxed">
                You're already on the installed app. New releases prompt you to update automatically.
              </p>
            )}
          </Card>

          <Card>
            <p className="eyebrow mb-2">What's new</p>
            {release.body ? (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-secondary font-sans line-clamp-[14]">
                {notesExcerpt(release.body)}
              </pre>
            ) : (
              <p className="text-sm text-secondary">No notes provided.</p>
            )}
          </Card>
        </motion.div>
      )}
    </>
  );
}

function NoReleaseState({ errored }: { errored: boolean }) {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <Smartphone className="w-6 h-6 text-secondary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">
            {errored ? 'Could not reach GitHub' : 'No releases yet'}
          </h3>
          <p className="text-sm text-secondary mt-1.5 leading-relaxed">
            {errored
              ? 'The release API is temporarily unavailable. Try again in a few minutes.'
              : 'The first build will appear automatically after the next push to main.'}
          </p>
        </div>
      </div>
    </Card>
  );
}
