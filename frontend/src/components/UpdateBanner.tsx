/**
 * Self-update prompt for the installed Android app.
 *
 * Mounts inside the dashboard shell. On native Android, compares the running
 * app's versionCode against the latest GitHub Release and shows a sticky,
 * non-blocking banner when an update is available. Web/iOS render nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLatestRelease } from '../hooks/useLatestRelease';
import { AppInstaller } from '../lib/appInstaller';

const DISMISS_KEY = 'coldscout.updateBanner.dismissedTag';

type Phase = 'idle' | 'downloading' | 'installing' | 'error';

export default function UpdateBanner() {
  const [currentBuild, setCurrentBuild] = useState<number | null>(null);
  const [dismissedTag, setDismissedTag] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  useEffect(() => {
    if (!isNativeAndroid) return;
    let cancelled = false;
    CapacitorApp.getInfo()
      .then((info) => {
        if (!cancelled) setCurrentBuild(Number(info.build));
      })
      .catch(() => {
        if (!cancelled) setCurrentBuild(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isNativeAndroid]);

  const { data: release } = useLatestRelease();

  const updateAvailable = useMemo(() => {
    if (!isNativeAndroid) return false;
    if (!release || !release.apk) return false;
    if (release.versionCode == null || currentBuild == null) return false;
    return release.versionCode > currentBuild;
  }, [isNativeAndroid, release, currentBuild]);

  if (!isNativeAndroid || !updateAvailable || !release || !release.apk) return null;
  if (dismissedTag === release.tag) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, release.tag);
    } catch {
      // Ignore storage failures — banner reappears next launch either way.
    }
    setDismissedTag(release.tag);
  };

  const handleUpdate = async () => {
    if (phase === 'downloading' || phase === 'installing') return;
    setPhase('downloading');
    setProgress(0);

    const apk = release.apk;
    if (!apk) {
      setPhase('error');
      toast.error('No APK in latest release');
      return;
    }

    const fileName = `coldscout-${release.versionName}.apk`;
    const filePath = `updates/${fileName}`;

    try {
      const res = await fetch(apk.browser_download_url);
      if (!res.ok || !res.body) {
        throw new Error(`Download failed: ${res.status}`);
      }

      const total = Number(res.headers.get('content-length')) || apk.size || 0;
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy BlobPart typing.
          const copy = new Uint8Array(value.byteLength);
          copy.set(value);
          chunks.push(copy);
          received += value.length;
          if (total > 0) {
            setProgress(Math.min(99, Math.round((received / total) * 100)));
          }
        }
      }

      const blob = new Blob(chunks);
      const base64 = await blobToBase64(blob);

      const written = await Filesystem.writeFile({
        path: filePath,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });

      setProgress(100);
      setPhase('installing');

      const allowed = await AppInstaller.canRequestPackageInstalls();
      if (!allowed.allowed) {
        toast(
          'Allow Cold Scout to install apps in system settings, then tap Update again.',
          { duration: 6000 },
        );
      }

      await AppInstaller.install({ path: written.uri });
      setPhase('idle');
    } catch (err) {
      setPhase('error');
      const message = err instanceof Error ? err.message : 'Update failed';
      toast.error(message);
    }
  };

  const isBusy = phase === 'downloading' || phase === 'installing';

  return (
    <AnimatePresence>
      <motion.div
        key="update-banner"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="relative z-[100] bg-black/80 backdrop-blur-xl text-white border-b border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
        role="status"
      >
        <div className="flex items-center gap-3 px-4 md:px-6 py-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Download className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs md:text-sm font-medium truncate">
              {phase === 'downloading' && `Downloading update… ${progress}%`}
              {phase === 'installing' && 'Opening installer…'}
              {phase === 'error' && 'Update failed — tap Retry'}
              {phase === 'idle' && (
                <>
                  Update available — <span className="font-semibold">v{release.versionName}</span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={handleUpdate}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-semibold bg-white text-black rounded-full hover:bg-gray-200 transition-all duration-200 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : phase === 'error' ? (
              'Retry'
            ) : (
              'Update'
            )}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            disabled={isBusy}
            aria-label="Dismiss update"
            className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read APK'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read APK'));
    reader.readAsDataURL(blob);
  });
}
