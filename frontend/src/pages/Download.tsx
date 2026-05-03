/**
 * Download page — public-facing entry point for the signed Android APK.
 *
 * Pulls the latest GitHub Release for the `android-v*` tag pattern and
 * exposes a single primary "Download APK" button plus release metadata.
 * Falls back gracefully when no release is available or the API errors.
 *
 * iOS users see an "Install on iOS" card with the Add-to-Home-Screen flow,
 * which gives them a full app shell (web push, offline cache, no Safari
 * chrome) without us needing a paid Apple Developer account or App Store
 * approval.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  Smartphone, Download as DownloadIcon, ExternalLink, ShieldCheck, Calendar, Box,
  Apple, Share2, PlusSquare, Globe2, CheckCircle2,
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

/**
 * Detects whether the current page is already running as an installed PWA
 * (iOS Safari adds ``standalone`` on ``window.navigator``; everyone else
 * exposes the ``display-mode: standalone`` CSS media query).
 */
function isInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (navStandalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Modern iPad reports as Mac — disambiguate by touch support.
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return ua.includes('Mac') && 'ontouchend' in document;
}

export default function Download() {
  useSEO({
    title: 'Download App | Cold Scout',
    description: 'Download the Cold Scout app — Android APK and iOS install via Safari (Add to Home Screen).',
    index: false,
  });

  const { data: release, isLoading, isError } = useLatestRelease();
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <PublicNavbar />
      <main className="flex-1 px-4 md:px-8 lg:px-16 pt-28 pb-16">
        <div className="max-w-5xl mx-auto">
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
        title="Get the App"
        subtitle="Cold Scout for Android, iOS, and the web — pick whichever fits your device."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AndroidCard release={release} isError={isError} isAndroidNative={isAndroidNative} />
        <IOSCard />
      </div>

      {release && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-4"
        >
          <Card>
            <p className="eyebrow mb-2">What's new in Android v{release.versionName}</p>
            {release.body ? (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-secondary font-sans">
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

function AndroidCard({ release, isError, isAndroidNative }: ContentsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="h-full">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-1">Android</p>
            {release ? (
              <h3 className="text-lg font-semibold text-white tracking-tight truncate">
                Cold Scout v{release.versionName}
              </h3>
            ) : (
              <h3 className="text-lg font-semibold text-white tracking-tight">
                {isError ? 'Could not reach GitHub' : 'No releases yet'}
              </h3>
            )}
            {release && (
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
            )}
            {!release && (
              <p className="text-sm text-secondary mt-1.5 leading-relaxed">
                {isError
                  ? 'The release API is temporarily unavailable. Try again in a few minutes.'
                  : 'The first build will appear automatically after the next push to main.'}
              </p>
            )}
          </div>
        </div>

        {release && (
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
        )}

        {!isAndroidNative && release && (
          <p className="mt-4 text-xs text-tertiary leading-relaxed">
            Sideload by opening the downloaded APK on your device. The app will prompt
            you to update automatically when a new release ships.
          </p>
        )}
        {isAndroidNative && (
          <p className="mt-4 text-xs text-tertiary leading-relaxed">
            You're already on the installed Android app. New releases prompt you to
            update automatically.
          </p>
        )}
      </Card>
    </motion.div>
  );
}

/**
 * iOS install card — guides the user through Safari's "Add to Home Screen"
 * flow, which is the closest thing to an App Store install you can ship
 * without the paid Apple Developer Program. Once installed, the PWA gets
 * a real home-screen icon, full-screen chrome, and (on iOS 16.4+) push
 * notifications via the same Web Push subscription used on web/Android.
 */
function IOSCard() {
  const isIOS = useMemo(() => detectIOS(), []);
  // Lazy initializer: ``isInstalledPwa()`` reads from ``window`` so it must
  // run after hydration, but capturing it on first render is safe and avoids
  // the cascading-render warning that comes from setState-in-effect.
  const [installed] = useState(() => isInstalledPwa());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
    >
      <Card className="h-full">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
            <Apple className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-1">iOS · iPhone &amp; iPad</p>
            <h3 className="text-lg font-semibold text-white tracking-tight">
              Install via Safari
            </h3>
            <p className="text-xs text-secondary mt-1.5 leading-relaxed">
              No App Store needed. Cold Scout installs as a full-screen progressive web app
              with notifications on iOS 16.4 or newer.
            </p>
          </div>
        </div>

        {installed ? (
          <div className="mt-5 inline-flex items-center gap-2 text-sm text-white/85">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            You're already running the installed app.
          </div>
        ) : (
          <ol className="mt-5 space-y-2.5 text-sm text-white/85">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-mono inline-flex items-center justify-center">1</span>
              <span className="leading-relaxed">
                Open <span className="text-white">coldscout.colddsam.com</span> in <span className="text-white">Safari</span> on your iPhone or iPad.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-mono inline-flex items-center justify-center">2</span>
              <span className="leading-relaxed inline-flex flex-wrap items-center gap-1.5">
                Tap the Share button <Share2 className="inline w-3.5 h-3.5 text-white/70" /> at the bottom of the screen.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-mono inline-flex items-center justify-center">3</span>
              <span className="leading-relaxed inline-flex flex-wrap items-center gap-1.5">
                Choose <span className="text-white">Add to Home Screen</span> <PlusSquare className="inline w-3.5 h-3.5 text-white/70" />.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-mono inline-flex items-center justify-center">4</span>
              <span className="leading-relaxed">
                Confirm. Cold Scout's icon appears on your home screen — tap it like any native app.
              </span>
            </li>
          </ol>
        )}

        {!isIOS && !installed && (
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-tertiary leading-relaxed">
            <Globe2 className="w-3.5 h-3.5" />
            You're not on iOS right now. Open this page on an iPhone or iPad in Safari to install.
          </p>
        )}
      </Card>
    </motion.div>
  );
}
