/**
 * API Key Orchestrator admin page.
 *
 * Superuser-only console for the dynamic credential pool that powers every
 * outbound third-party call (Groq, Gemini, Google Places, Meta Threads).
 * Operators can add keys, retire them, watch usage / cooldown / failure
 * counters live, and clear cooldowns without restarting the backend.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  KeyRound, PlusCircle, RefreshCw, Power, Trash2, ShieldCheck, ArrowLeft, Pencil, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import PageHeader from '../components/layout/PageHeader';
import {
  useAPIKeys,
  useAPIKeyStats,
  useAPIKeyProviderMap,
  useCreateAPIKey,
  useUpdateAPIKey,
  useToggleAPIKey,
  useResetAPIKeyCooldown,
  useDeleteAPIKey,
  usePreviewAPIKeyWeight,
} from '../hooks/useApiKeys';
import { useAuth } from '../hooks/useAuth';
import { pageTransition, staggerContainer, staggerItem } from '../lib/motion';
import type { APIKeyCollision, APIKeyRecord, APIKeyStatus } from '../lib/api';

const STATUS_TO_VARIANT: Record<APIKeyStatus, 'green' | 'amber' | 'red'> = {
  active: 'green',
  cooldown: 'amber',
  disabled: 'red',
};

const STATUS_LABEL: Record<APIKeyStatus, string> = {
  active: 'Active',
  cooldown: 'Cooldown',
  disabled: 'Disabled',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cooldownRemaining(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.ceil(mins / 60);
  return `${hours}h left`;
}

interface FormState {
  provider_name: string;
  use_case: string;
  label: string;
  api_key: string;
  weight: number;
}

const EMPTY_FORM: FormState = {
  provider_name: 'GROQ',
  use_case: 'GENERAL',
  label: '',
  api_key: '',
  weight: 1,
};

export default function APIKeys() {
  const { user } = useAuth();
  const { data: keys = [], isLoading: keysLoading } = useAPIKeys();
  const { data: stats, isLoading: statsLoading } = useAPIKeyStats();
  const { data: providerMap } = useAPIKeyProviderMap();
  const createMut = useCreateAPIKey();
  const updateMut = useUpdateAPIKey();
  const toggleMut = useToggleAPIKey();
  const cooldownMut = useResetAPIKeyCooldown();
  const deleteMut = useDeleteAPIKey();
  const previewMut = usePreviewAPIKeyWeight();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<APIKeyRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [weightPreview, setWeightPreview] = useState<APIKeyCollision[]>([]);

  // Strict superuser gate — the backend already enforces this, but rendering
  // the empty page to a non-admin is a worse experience than redirecting.
  if (user && !user.is_superuser) {
    return <Navigate to="/settings" replace />;
  }

  const providers = useMemo(() => {
    if (providerMap) return Object.keys(providerMap.providers);
    return stats?.valid_providers ?? ['GROQ', 'GEMINI', 'GOOGLE_PLACES', 'META_THREADS'];
  }, [providerMap, stats]);

  // Use-cases available for the currently-selected provider in the form.
  // Falls back to the full list if the providerMap hasn't loaded yet.
  const useCases = useMemo(() => {
    if (providerMap?.providers[form.provider_name]) {
      return providerMap.providers[form.provider_name];
    }
    return stats?.valid_use_cases ?? [
      'GENERAL', 'DISCOVERY', 'SCORING', 'PERSONALIZATION', 'WEBSITE_DEMO',
    ];
  }, [providerMap, stats, form.provider_name]);

  // Debounced preview of the weight cascade so the operator sees the impact
  // before submitting. We only fire when the modal is open + weight changed.
  useEffect(() => {
    if (!modalOpen) {
      setWeightPreview([]);
      return;
    }
    const handle = setTimeout(() => {
      previewMut.mutate(
        {
          provider_name: form.provider_name,
          weight: form.weight,
          exclude_id: editing?.id,
        },
        {
          onSuccess: (resp) => setWeightPreview(resp.weight_collisions),
          onError: () => setWeightPreview([]),
        },
      );
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, form.provider_name, form.weight, editing?.id]);

  const grouped = useMemo(() => {
    const out: Record<string, APIKeyRecord[]> = {};
    for (const k of keys) {
      if (!out[k.provider_name]) out[k.provider_name] = [];
      out[k.provider_name].push(k);
    }
    return out;
  }, [keys]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setWeightPreview([]);
    setModalOpen(true);
  };

  const openEdit = (record: APIKeyRecord) => {
    setEditing(record);
    setForm({
      provider_name: record.provider_name,
      use_case: record.use_case,
      label: record.label ?? '',
      api_key: '',
      weight: record.weight,
    });
    setWeightPreview([]);
    setModalOpen(true);
  };

  // Keep the form's use_case valid whenever the operator switches providers.
  // The provider map is authoritative — a key tagged WEBSITE_DEMO shouldn't
  // be allowed on a GOOGLE_PLACES credential, for instance.
  useEffect(() => {
    if (!providerMap) return;
    const allowed = providerMap.providers[form.provider_name];
    if (allowed && !allowed.includes(form.use_case)) {
      setForm((prev) => ({ ...prev, use_case: allowed[0] ?? 'GENERAL' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.provider_name, providerMap]);

  const submitForm = async () => {
    if (editing) {
      const payload: Record<string, unknown> = {
        label: form.label || null,
        use_case: form.use_case,
        weight: form.weight,
      };
      if (form.api_key.trim().length > 0) {
        payload.api_key = form.api_key.trim();
      }
      await updateMut.mutateAsync({ id: editing.id, payload });
    } else {
      if (!form.api_key.trim()) {
        toast.error('API key is required');
        return;
      }
      await createMut.mutateAsync({
        provider_name: form.provider_name,
        use_case: form.use_case,
        label: form.label || null,
        weight: form.weight,
        api_key: form.api_key.trim(),
      });
    }
    setModalOpen(false);
  };

  if (keysLoading || statsLoading) return <PageLoader />;

  const totals = stats?.totals;

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Admin"
        title="API Key Orchestrator"
        subtitle="Rotate, monitor, and fail over between every third-party API credential."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/settings">
              <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
                Back
              </Button>
            </Link>
            <Button size="sm" icon={<PlusCircle className="w-3.5 h-3.5" />} onClick={openCreate}>
              Add key
            </Button>
          </div>
        }
      />

      {/* Stat tiles */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <StatTile label="Active keys" value={totals?.active_keys ?? 0} variant="green" />
        <StatTile label="In cooldown" value={totals?.cooldown_keys ?? 0} variant="amber" />
        <StatTile label="Disabled" value={totals?.disabled_keys ?? 0} variant="red" />
        <StatTile label="Total requests" value={totals?.total_usage ?? 0} variant="teal" />
      </motion.div>

      {/* Per-provider breakdown */}
      {stats && stats.rows.length > 0 && (
        <Card title={<><ShieldCheck className="w-3.5 h-3.5" />Provider breakdown</>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-tertiary border-b border-white/[0.06]">
                  <th className="text-left py-2 pr-3 font-medium">Provider</th>
                  <th className="text-left py-2 pr-3 font-medium">Use case</th>
                  <th className="text-right py-2 pr-3 font-medium">Active</th>
                  <th className="text-right py-2 pr-3 font-medium">Cooldown</th>
                  <th className="text-right py-2 pr-3 font-medium">Disabled</th>
                  <th className="text-right py-2 pr-3 font-medium">Requests</th>
                  <th className="text-right py-2 pr-3 font-medium">429s</th>
                  <th className="text-right py-2 font-medium">Failures</th>
                </tr>
              </thead>
              <tbody>
                {stats.rows.map((row) => (
                  <tr key={`${row.provider_name}:${row.use_case}`} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-3 font-medium">{row.provider_name}</td>
                    <td className="py-2 pr-3 text-secondary">{row.use_case}</td>
                    <td className="py-2 pr-3 text-right">{row.active_keys}</td>
                    <td className="py-2 pr-3 text-right">{row.cooldown_keys}</td>
                    <td className="py-2 pr-3 text-right">{row.disabled_keys}</td>
                    <td className="py-2 pr-3 text-right">{row.total_usage}</td>
                    <td className="py-2 pr-3 text-right">{row.total_rate_limit_hits}</td>
                    <td className="py-2 text-right">{row.total_failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Key list grouped by provider */}
      <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" animate="visible">
        {keys.length === 0 && (
          <motion.div variants={staggerItem}>
            <Card>
              <div className="text-center py-10">
                <KeyRound className="w-8 h-8 mx-auto text-tertiary mb-2" />
                <p className="text-[13px] text-white font-medium">No API keys configured yet</p>
                <p className="text-meta mt-1">
                  The backend will use legacy <code>.env</code> credentials until you add the
                  first key here.
                </p>
                <div className="mt-4">
                  <Button size="sm" icon={<PlusCircle className="w-3.5 h-3.5" />} onClick={openCreate}>
                    Add the first key
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {Object.entries(grouped).map(([provider, rows]) => (
          <motion.div variants={staggerItem} key={provider}>
            <Card title={<><KeyRound className="w-3.5 h-3.5" />{provider}</>}>
              <div className="space-y-2.5">
                {rows.map((row) => (
                  <KeyRow
                    key={row.id}
                    record={row}
                    onEdit={() => openEdit(row)}
                    onToggle={() => toggleMut.mutate(row.id)}
                    onResetCooldown={() => cooldownMut.mutate(row.id)}
                    onDelete={() => {
                      if (window.confirm(`Delete ${row.provider_name} key${row.label ? ` "${row.label}"` : ''}?`)) {
                        deleteMut.mutate(row.id);
                      }
                    }}
                  />
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Add / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit API key' : 'Add API key'}
        maxWidth="max-w-lg"
      >
        <div className="space-y-3.5 px-1 pb-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <select
                className="input-field"
                value={form.provider_name}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
              >
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Use case">
              <select
                className="input-field"
                value={form.use_case}
                onChange={(e) => setForm({ ...form, use_case: e.target.value })}
              >
                {useCases.map((u) => (
                  <option key={u} value={u}>
                    {u === 'GENERAL' ? 'GENERAL (all jobs)' : u}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-[11px] text-tertiary leading-relaxed -mt-2">
            {form.use_case === 'GENERAL' ? (
              <>This key is eligible for every {form.provider_name} job in the pipeline.</>
            ) : (
              <>This key will only be used for <strong>{form.use_case}</strong>.</>
            )}
          </p>

          <Field label="Label (optional)">
            <input
              className="input-field"
              placeholder="e.g. Groq personal #1"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>

          <Field label={editing ? 'Replace API key (leave empty to keep current)' : 'API key'}>
            <input
              className="input-field font-mono text-[12px]"
              type="password"
              autoComplete="off"
              placeholder={editing ? 'Leave blank to keep current key' : 'gsk_... / AIza... / ...'}
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            />
          </Field>

          <Field label="Weight (higher = more traffic)">
            <input
              className="input-field"
              type="number"
              min={1}
              max={100}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Math.max(1, Math.min(100, Number(e.target.value || 1))) })}
            />
          </Field>

          {weightPreview.length > 0 && (
            <div className="bg-warning/[0.06] border border-warning/30 rounded-md p-3 text-[12px] text-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    Weight {form.weight} is already held — these keys will shift down:
                  </p>
                  <ul className="mt-1.5 space-y-1 list-disc list-inside marker:text-warning/60">
                    {weightPreview.map((c) => (
                      <li key={c.id}>
                        <span className="text-white/90 font-medium">
                          {c.label || `${c.use_case} key`}
                        </span>
                        <span className="text-tertiary"> ({c.use_case}): {c.old_weight} → {c.new_weight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitForm}
              loading={createMut.isPending || updateMut.isPending}
            >
              {editing ? 'Save changes' : 'Add key'}
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

interface KeyRowProps {
  record: APIKeyRecord;
  onEdit: () => void;
  onToggle: () => void;
  onResetCooldown: () => void;
  onDelete: () => void;
}

function KeyRow({ record, onEdit, onToggle, onResetCooldown, onDelete }: KeyRowProps) {
  const status = record.status;
  const variant = STATUS_TO_VARIANT[status];
  const remaining = cooldownRemaining(record.cooldown_until);
  return (
    <div className="flex flex-col gap-2 p-3 border border-white/[0.06] rounded-lg bg-white/[0.02] hover:bg-white/[0.035] transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-white">
              {record.label || `${record.provider_name} key`}
            </span>
            <Badge label={STATUS_LABEL[status]} variant={variant} pulse={status === 'active'} />
            <span className="text-[10px] uppercase tracking-wide text-tertiary bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded-full">
              {record.use_case}
            </span>
            {remaining && status === 'cooldown' && (
              <span className="text-[10px] text-warning">{remaining}</span>
            )}
          </div>
          <p className="text-[11px] text-tertiary font-mono mt-1">{record.api_key_preview}</p>
          {record.last_failure_reason && (
            <p className="text-[11px] text-danger mt-1 truncate" title={record.last_failure_reason}>
              Last error: {record.last_failure_reason}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="w-3.5 h-3.5" />}
            onClick={onEdit}
            aria-label="Edit key"
          />
          {status === 'cooldown' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={onResetCooldown}
              aria-label="Clear cooldown"
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Power className="w-3.5 h-3.5" />}
            onClick={onToggle}
            aria-label={record.is_active ? 'Deactivate' : 'Activate'}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={onDelete}
            aria-label="Delete key"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-tertiary">
        <Metric label="Requests" value={record.usage_count} />
        <Metric label="429s" value={record.rate_limit_hits} />
        <Metric label="Failures" value={record.total_failures} />
        <Metric label="Last used" value={formatDateTime(record.last_used_at)} />
      </div>
    </div>
  );
}

interface MetricProps { label: string; value: number | string }
function Metric({ label, value }: MetricProps) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-tertiary">{label}</p>
      <p className="text-[12px] text-white font-medium tabular-nums">{value}</p>
    </div>
  );
}

interface FieldProps { label: string; children: React.ReactNode }
function Field({ label, children }: FieldProps) {
  return (
    <label className="block">
      <span className="text-[11px] text-tertiary uppercase tracking-wide block mb-1">{label}</span>
      {children}
    </label>
  );
}

interface StatTileProps {
  label: string;
  value: number;
  variant: 'green' | 'amber' | 'red' | 'teal';
}

function StatTile({ label, value, variant }: StatTileProps) {
  const color: Record<string, string> = {
    green: 'text-success',
    amber: 'text-warning',
    red: 'text-danger',
    teal: 'text-white',
  };
  return (
    <motion.div variants={staggerItem}>
      <Card>
        <p className="text-[11px] text-tertiary uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold mt-1 tabular-nums ${color[variant]}`}>{value}</p>
      </Card>
    </motion.div>
  );
}
