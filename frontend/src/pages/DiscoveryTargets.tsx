/**
 * Discovery Targets page.
 *
 * Per-freelancer page for choosing how the next discovery run picks
 * (location, category) targets. Two modes:
 *
 * - Auto (default): the AI picks targets and skips anything searched in
 *   the last 60 days. The freelancer sees the recent SearchHistory and
 *   can clear individual entries to re-allow them.
 *
 * - Manual: the freelancer pins their own (location, category, slider)
 *   targets. Sum of sliders must stay ≤ the per-freelancer
 *   DISCOVERY_BATCH_LIMIT cap. Recent SearchHistory is bypassed in
 *   this mode (per product decision: "research it any way").
 *
 * Strictly per-user: every endpoint reads/writes only the calling
 * freelancer's row, even for superusers.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Eye,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import CascadingLocationPicker from '../components/ui/CascadingLocationPicker';
import Combobox from '../components/ui/Combobox';
import ErrorState from '../components/ui/ErrorState';
import Toggle from '../components/ui/Toggle';
import { pageTransition } from '../lib/motion';
import { cn } from '../lib/utils';
import {
  useClearAllDiscoveryHistory,
  useDeleteDiscoveryHistoryEntry,
  useDiscoveryCategories,
  useDiscoveryConfig,
  useDiscoveryHistory,
  useDiscoveryLimits,
  useDiscoveryPreview,
  useUpdateDiscoveryConfig,
} from '../hooks/useDiscoveryConfig';
import type { DiscoveryDepth, DiscoveryHistoryEntry, DiscoveryTarget } from '../lib/api';

const DEPTH_LABELS: Record<DiscoveryDepth, string> = {
  sub_area: 'Neighborhood (~3 km)',
  city: 'City (~10 km)',
  region: 'Region / State (~25 km)',
  country: 'Country (~50 km)',
};

function emptyTarget(defaultMax: number): DiscoveryTarget {
  return {
    country: '',
    country_code: '',
    region: '',
    city: '',
    sub_area: '',
    category: '',
    location_depth: 'city',
    max_results: defaultMax,
  };
}

function normalizeTargetForSave(t: DiscoveryTarget): DiscoveryTarget {
  return {
    country: t.country?.trim() || null,
    country_code: t.country_code?.trim() ? t.country_code.trim().toUpperCase() : null,
    region: t.region?.trim() || null,
    city: t.city.trim(),
    sub_area: t.sub_area?.trim() || null,
    category: t.category.trim(),
    location_depth: t.location_depth,
    max_results: Math.max(1, Math.floor(t.max_results || 1)),
  };
}

export default function DiscoveryTargets() {
  const cfgQ = useDiscoveryConfig();
  const limitsQ = useDiscoveryLimits();
  const categoriesQ = useDiscoveryCategories();
  const historyQ = useDiscoveryHistory(60);
  const previewQ = useDiscoveryPreview();
  const saveCfg = useUpdateDiscoveryConfig();
  const deleteHist = useDeleteDiscoveryHistoryEntry();
  const clearHist = useClearAllDiscoveryHistory();

  // Local edit state — initialized from server config, then mutated
  // freely until the user clicks Save (so they can stage multiple
  // changes without partial commits).
  //
  // We reset the form during render whenever the server-side reference
  // to the config object changes (saved -> refetched, or first load).
  // This is the React-recommended pattern for "derive local state from
  // a prop/source, but reset it when that source changes" — see
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  // It avoids the setState-in-useEffect cascade.
  const [autoEnabled, setAutoEnabled] = useState<boolean>(true);
  const [targets, setTargets] = useState<DiscoveryTarget[]>([]);
  const [dirty, setDirty] = useState(false);
  const [seededRef, setSeededRef] = useState<typeof cfgQ.data | undefined>(undefined);

  if (cfgQ.data && cfgQ.data !== seededRef) {
    setSeededRef(cfgQ.data);
    setAutoEnabled(cfgQ.data.auto_mode_enabled);
    setTargets(cfgQ.data.pinned_targets);
    setDirty(false);
  }

  const batchLimit = limitsQ.data?.batch_limit ?? cfgQ.data?.batch_limit ?? 100;
  const maxTargets = limitsQ.data?.max_targets ?? cfgQ.data?.max_targets ?? 10;
  const minPerTarget = limitsQ.data?.min_results_per_target ?? 1;
  const allowedDepths = limitsQ.data?.allowed_depths ?? (
    ['sub_area', 'city', 'region', 'country'] as DiscoveryDepth[]
  );

  const totalRequested = useMemo(
    () => targets.reduce((sum, t) => sum + (Number(t.max_results) || 0), 0),
    [targets],
  );
  const overCap = totalRequested > batchLimit;
  const remaining = Math.max(0, batchLimit - totalRequested);

  // Detect inline duplicates so we can flag them in the UI before save.
  const duplicateIdx = useMemo(() => {
    const seen = new Map<string, number>();
    const dups = new Set<number>();
    targets.forEach((t, i) => {
      const key = [
        (t.city || '').toLowerCase().trim(),
        (t.category || '').toLowerCase().trim(),
        t.location_depth,
        (t.sub_area || '').toLowerCase().trim(),
      ].join('|');
      if (!t.city || !t.category) return;
      if (seen.has(key)) {
        dups.add(i);
        dups.add(seen.get(key)!);
      } else {
        seen.set(key, i);
      }
    });
    return dups;
  }, [targets]);

  const blockingErrors: string[] = [];
  if (!autoEnabled) {
    if (overCap) {
      blockingErrors.push(
        `Total requested leads (${totalRequested}) is over your daily cap of ${batchLimit}. Lower the sliders.`,
      );
    }
    if (duplicateIdx.size > 0) {
      blockingErrors.push('Two or more targets are identical — adjust city, sub-area, category, or depth so each is unique.');
    }
    targets.forEach((t, i) => {
      if (!t.city.trim()) blockingErrors.push(`Target #${i + 1}: city is required.`);
      if (!t.category.trim()) blockingErrors.push(`Target #${i + 1}: category is required.`);
    });
  }
  // Dedup error list (per-target validation can produce repeats).
  const uniqueErrors = Array.from(new Set(blockingErrors));

  const updateTarget = (idx: number, patch: Partial<DiscoveryTarget>) => {
    setTargets((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const removeTarget = (idx: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addTarget = () => {
    if (targets.length >= maxTargets) return;
    // Default new target to whatever leftover budget we have, capped at 20
    // so the slider doesn't pin all the way right by default.
    const defaultMax = Math.max(minPerTarget, Math.min(20, remaining || minPerTarget));
    setTargets((prev) => [...prev, emptyTarget(defaultMax)]);
    setDirty(true);
  };

  const onAutoToggle = (next: boolean) => {
    setAutoEnabled(next);
    setDirty(true);
  };

  const onSave = () => {
    if (uniqueErrors.length > 0) return;
    saveCfg.mutate(
      {
        auto_mode_enabled: autoEnabled,
        pinned_targets: targets.map(normalizeTargetForSave),
      },
      {
        onSuccess: () => setDirty(false),
      },
    );
  };

  const onReset = () => {
    if (cfgQ.data) {
      setAutoEnabled(cfgQ.data.auto_mode_enabled);
      setTargets(cfgQ.data.pinned_targets);
      setDirty(false);
    }
  };

  if (cfgQ.isLoading || limitsQ.isLoading) return null;
  if (cfgQ.isError) {
    return (
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
        <PageHeader eyebrow="Discovery" title="Targets" subtitle="Could not load your discovery config" />
        <ErrorState
          title="Failed to load"
          message="Could not fetch discovery configuration from the server."
          onRetry={() => cfgQ.refetch()}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={pageTransition}
      initial="initial"
      animate="animate"
    >
      <PageHeader
        eyebrow="Discovery"
        title="Targets"
        subtitle="Decide where and what kind of leads the next discovery run will look for. Per-freelancer setup."
      />

      {/* Mode card */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white">
              <Sparkles className="w-4 h-4 text-accent" />
              <h2 className="text-base font-semibold">Discovery Mode</h2>
            </div>
            <p className="text-sm text-secondary mt-1 max-w-2xl">
              {autoEnabled ? (
                <>
                  <span className="text-white font-medium">Auto:</span> the AI picks fresh
                  (location, category) targets each run, skipping anything searched in the
                  last 60 days.
                </>
              ) : (
                <>
                  <span className="text-white font-medium">Manual:</span> only your pinned
                  targets below will be searched. Recent-search dedup is bypassed so the
                  same area can be re-queried.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-secondary">
              {autoEnabled ? 'AUTO' : 'MANUAL'}
            </span>
            <Toggle
              value={autoEnabled}
              onChange={onAutoToggle}
              labelOn="AUTO"
              labelOff="MANUAL"
              colorOn="bg-accent"
            />
          </div>
        </div>
      </Card>

      {/* Manual targets */}
      {!autoEnabled && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 text-white">
                <Target className="w-4 h-4 text-accent" />
                <h2 className="text-base font-semibold">Pinned Targets</h2>
              </div>
              <p className="text-sm text-secondary mt-1">
                Up to {maxTargets} targets. Total leads requested across all targets must
                not exceed your daily cap of {batchLimit}.
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  'text-2xl font-mono font-bold',
                  overCap ? 'text-red-400' : 'text-white',
                )}
              >
                {totalRequested}
                <span className="text-sm text-secondary"> / {batchLimit}</span>
              </p>
              <p className="text-xs text-secondary mt-0.5">
                {remaining > 0 ? `${remaining} leads remaining` : 'Cap reached'}
              </p>
            </div>
          </div>

          {targets.length === 0 ? (
            <div className="text-sm text-secondary border border-dashed border-white/10 rounded-lg p-6 text-center">
              No pinned targets yet. Click <span className="text-white font-medium">Add target</span> to
              choose a location and category.
              <p className="text-xs text-amber-400 mt-2">
                Manual mode is on but no targets configured — until you add at least one,
                the next run falls back to auto mode.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {targets.map((t, i) => (
                <TargetRow
                  key={i}
                  index={i}
                  target={t}
                  duplicate={duplicateIdx.has(i)}
                  categories={categoriesQ.data ?? []}
                  history={historyQ.data ?? []}
                  allowedDepths={allowedDepths}
                  minPerTarget={minPerTarget}
                  maxPerTarget={Math.max(minPerTarget, batchLimit)}
                  onChange={(patch) => updateTarget(i, patch)}
                  onRemove={() => removeTarget(i)}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={addTarget}
              disabled={targets.length >= maxTargets}
              title={
                targets.length >= maxTargets
                  ? `Limit of ${maxTargets} targets reached`
                  : 'Add another (location, category) target'
              }
            >
              Add target
            </Button>
            <span className="text-xs text-secondary">
              {targets.length} / {maxTargets} targets
            </span>
          </div>
        </Card>
      )}

      {/* Validation banner */}
      {uniqueErrors.length > 0 && (
        <Card className="bg-red-500/[0.06] border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-200">
              <p className="font-semibold mb-1">Fix these before saving:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {uniqueErrors.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Save bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={onSave}
          loading={saveCfg.isPending}
          disabled={!dirty || uniqueErrors.length > 0}
        >
          Save changes
        </Button>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Discard
          </Button>
        )}
        {dirty && !saveCfg.isPending && (
          <span className="text-xs text-amber-400">Unsaved changes</span>
        )}
      </div>

      {/* Preview next run */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-white">
            <Eye className="w-4 h-4 text-accent" />
            <h2 className="text-base font-semibold">Next-run Preview</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => previewQ.refetch()}
            loading={previewQ.isFetching}
          >
            Refresh
          </Button>
        </div>
        {previewQ.data?.note && (
          <p className="text-sm text-secondary mb-3">{previewQ.data.note}</p>
        )}
        {previewQ.data?.targets && previewQ.data.targets.length > 0 ? (
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-secondary text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2.5">City</th>
                  <th className="text-left p-2.5">Sub-area</th>
                  <th className="text-left p-2.5">Category</th>
                  <th className="text-left p-2.5">Country</th>
                  <th className="text-left p-2.5">Depth</th>
                  <th className="text-right p-2.5">Max</th>
                </tr>
              </thead>
              <tbody>
                {previewQ.data.targets.map((t, i) => (
                  <tr key={i} className="border-t border-white/[0.05]">
                    <td className="p-2.5 text-white">{t.city}</td>
                    <td className="p-2.5 text-secondary">{t.sub_area || '—'}</td>
                    <td className="p-2.5 text-white">{t.category}</td>
                    <td className="p-2.5 text-secondary">
                      {t.country_code || t.country || '—'}
                    </td>
                    <td className="p-2.5 text-secondary">{t.location_depth}</td>
                    <td className="p-2.5 text-right font-mono text-white">
                      {t.max_results ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          previewQ.data?.mode === 'auto' && (
            <p className="text-sm text-secondary">
              Auto mode is on; the next run will compute fresh AI targets.
            </p>
          )
        )}
      </Card>

      {/* Recent search history */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 text-white">
              <h2 className="text-base font-semibold">Recent Searches (last 60 days)</h2>
            </div>
            <p className="text-xs text-secondary mt-1">
              In auto mode these block the AI from re-picking the same area. Delete a row
              to free it up. In manual mode this list is informational only.
            </p>
          </div>
          {(historyQ.data?.length ?? 0) > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Clear all recent search history? This cannot be undone.')) {
                  clearHist.mutate();
                }
              }}
              loading={clearHist.isPending}
            >
              Clear all
            </Button>
          )}
        </div>
        {historyQ.isLoading ? (
          <p className="text-sm text-secondary">Loading…</p>
        ) : (historyQ.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-secondary">
            No searches recorded in the last 60 days.
          </p>
        ) : (
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-secondary text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2.5">When</th>
                  <th className="text-left p-2.5">City</th>
                  <th className="text-left p-2.5">Sub-area</th>
                  <th className="text-left p-2.5">Category</th>
                  <th className="text-left p-2.5">Country</th>
                  <th className="text-right p-2.5">Found</th>
                  <th className="text-right p-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {(historyQ.data ?? []).map((h) => (
                  <tr key={h.id} className="border-t border-white/[0.05]">
                    <td className="p-2.5 text-secondary text-xs whitespace-nowrap">
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                    <td className="p-2.5 text-white">{h.city}</td>
                    <td className="p-2.5 text-secondary">{h.sub_area || '—'}</td>
                    <td className="p-2.5 text-white">{h.category}</td>
                    <td className="p-2.5 text-secondary">
                      {h.country_code || h.country || '—'}
                    </td>
                    <td className="p-2.5 text-right font-mono text-white">
                      {h.results_count}
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => deleteHist.mutate(h.id)}
                        className="text-secondary hover:text-red-400 transition-colors"
                        title="Delete this entry — the area becomes searchable again"
                        disabled={deleteHist.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

interface TargetRowProps {
  index: number;
  target: DiscoveryTarget;
  duplicate: boolean;
  categories: string[];
  history: DiscoveryHistoryEntry[];
  allowedDepths: DiscoveryDepth[];
  minPerTarget: number;
  maxPerTarget: number;
  onChange: (patch: Partial<DiscoveryTarget>) => void;
  onRemove: () => void;
}

function TargetRow({
  index,
  target,
  duplicate,
  categories,
  history,
  allowedDepths,
  minPerTarget,
  maxPerTarget,
  onChange,
  onRemove,
}: TargetRowProps) {
  // Surface sub-area suggestions from the freelancer's own search history
  // for the currently-selected city so re-targeting a familiar
  // neighborhood is one click rather than a re-type.
  const subAreaSuggestions = useMemo(() => {
    if (!target.city) return [] as string[];
    const cityLc = target.city.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const h of history) {
      if (!h.sub_area) continue;
      if ((h.city || '').trim().toLowerCase() !== cityLc) continue;
      const v = h.sub_area.trim();
      const key = v.toLowerCase();
      if (!v || seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }, [history, target.city]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c, label: c })),
    [categories],
  );

  return (
    <div
      className={cn(
        'border rounded-lg p-4 space-y-4',
        duplicate
          ? 'border-amber-400/40 bg-amber-400/[0.04]'
          : 'border-white/[0.08] bg-white/[0.02]',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-secondary">
          Target #{index + 1}
          {duplicate && (
            <span className="ml-2 text-amber-400">duplicate</span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-secondary hover:text-red-400 transition-colors"
          title="Remove this target"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <CascadingLocationPicker
        value={{
          country: target.country || '',
          country_code: target.country_code || '',
          region: target.region || '',
          city: target.city || '',
          sub_area: target.sub_area || '',
        }}
        onChange={(patch) => {
          // The picker emits the same field names we store on the target,
          // so this is a direct passthrough — but we cast empty strings
          // to undefined-equivalent (empty) so normalization works.
          onChange(patch);
        }}
        subAreaSuggestions={subAreaSuggestions}
        cityRequired
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Combobox
            label="Business type"
            required
            value={target.category || ''}
            onChange={(v) => onChange({ category: v })}
            options={categoryOptions}
            placeholder="Select business type…"
            searchPlaceholder="Search business types…"
            otherLabel="Other (type business type)"
          />
        </div>

        <Select
          label="Search depth"
          value={target.location_depth}
          onChange={(v) => onChange({ location_depth: v as DiscoveryDepth })}
          options={allowedDepths.map((d) => ({ value: d, label: DEPTH_LABELS[d] || d }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-secondary mb-1">
          Max leads from this target:{' '}
          <span className="text-white font-mono">{target.max_results}</span>
        </label>
        <input
          type="range"
          min={minPerTarget}
          max={maxPerTarget}
          value={target.max_results}
          onChange={(e) => onChange({ max_results: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[10px] text-secondary mt-0.5">
          <span>{minPerTarget}</span>
          <span>{maxPerTarget}</span>
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/40 border border-white/[0.1] rounded-md px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-black">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
