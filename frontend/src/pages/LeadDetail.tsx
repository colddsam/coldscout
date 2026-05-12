import { useState } from 'react';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem } from '../lib/motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useLead, useUpdateLead, useDeleteLead } from '../hooks/useLeads';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { statusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import PageHeader from '../components/layout/PageHeader';
import { formatDate, cn } from '../lib/utils';
import { LEAD_STATUSES } from '../lib/constants';
import { ArrowLeft, ExternalLink, MapPin, Phone, Mail, Star, Trash2, Globe, Save, Map, Monitor, RefreshCw, Eye, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { client } from '../lib/api';
import LeadOutreachActions from '../components/dashboard/LeadOutreachActions';

/**
 * Lead Detail & Management View.
 * 
 * Consolidates all discovery, qualification, and outreach data for a specific prospect. 
 * Serves as the primary CRM editing surface for status updates, notes, and lead deletion.
 */
export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id!);
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!lead) return <div className="text-center py-12 text-tertiary font-mono text-sm">Lead not found</div>;

  const handleStatusSave = () => {
    if (!editStatus) return;
    updateLead.mutate({ id: lead.id, payload: { status: editStatus } });
  };

  const handleNotesSave = () => {
    updateLead.mutate({ id: lead.id, payload: { notes: editNotes } });
    setEditingNotes(false);
  };

  const score = lead.ai_score || 0;

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Lead"
        title={lead.business_name}
        subtitle={[
          [lead.sub_area, lead.city, lead.region, lead.country].filter(Boolean).join(', '),
          lead.category,
        ].filter(Boolean).join(' · ')}
        actions={
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/leads')}>
            Back to Leads
          </Button>
        }
      />

      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={staggerContainer} initial="hidden" animate="visible">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Score + Header */}
          <motion.div variants={staggerItem}>
          <Card>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
              {/* Score Ring */}
              <div className="relative w-[88px] h-[88px] flex-shrink-0">
                <svg className="w-[88px] h-[88px] -rotate-90" viewBox="0 0 88 88">
                  <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                  <motion.circle
                    cx="44" cy="44" r="38" fill="none"
                    stroke="white"
                    strokeOpacity={score >= 80 ? 1 : score >= 60 ? 0.65 : 0.35}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="239"
                    initial={{ strokeDashoffset: 239 }}
                    animate={{ strokeDashoffset: 239 - (Math.min(score, 100) / 100) * 239 }}
                    transition={{ duration: 1.1, ease: [0.25, 0.1, 0.25, 1] }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-display-num text-[1.4rem] leading-none text-white">{score}</span>
                  <span className="eyebrow text-[9px] mt-1">Score</span>
                </div>
              </div>
              <div className="text-center sm:text-left min-w-0">
                <h2 className="heading-page truncate">{lead.business_name}</h2>
                <p className="text-secondary text-[13px] mt-1">{[lead.sub_area, lead.city, lead.region, lead.country].filter(Boolean).join(', ')} · {lead.category}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                  {statusBadge(lead.status)}
                  {lead.rating && (
                    <span className="chip">
                      <Star className="w-3 h-3 fill-current" />
                      {lead.rating} · {lead.review_count} reviews
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
          </motion.div>

          {/* Business Info */}
          <motion.div variants={staggerItem}>
          <Card title="Business Info">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lead.phone && (
                <div className="flex items-center gap-2.5 text-[13px]">
                  <Phone className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                  <span className="text-secondary">{lead.phone}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2.5 text-[13px] min-w-0">
                  <Mail className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                  <a href={`mailto:${lead.email}`} className="text-white hover:underline truncate">{lead.email}</a>
                </div>
              )}
              {lead.website_url && (
                <div className="flex items-center gap-2.5 text-[13px] min-w-0">
                  <Globe className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                  <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline truncate inline-flex items-center gap-1">
                    {lead.website_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              )}
              {lead.google_maps_url && (
                <div className="flex items-center gap-2.5 text-[13px]">
                  <MapPin className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                  <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline inline-flex items-center gap-1">
                    Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {lead.latitude && lead.longitude && (
                <div className="flex items-center gap-2.5 text-[13px]">
                  <Map className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                  <a
                    href={`https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:underline font-mono text-[11px] inline-flex items-center gap-1"
                  >
                    {lead.latitude.toFixed(4)}, {lead.longitude.toFixed(4)} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
            {(lead.country || lead.region || lead.sub_area || lead.postal_code) && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="eyebrow mb-2.5">Location Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                  {lead.country && (
                    <div><span className="text-tertiary">Country:</span> <span className="text-secondary ml-1">{lead.country} {lead.country_code ? `(${lead.country_code})` : ''}</span></div>
                  )}
                  {lead.region && (
                    <div><span className="text-tertiary">Region:</span> <span className="text-secondary ml-1">{lead.region}</span></div>
                  )}
                  {lead.sub_area && (
                    <div><span className="text-tertiary">Sub-Area:</span> <span className="text-secondary ml-1">{lead.sub_area}</span></div>
                  )}
                  {lead.postal_code && (
                    <div><span className="text-tertiary">Postal:</span> <span className="text-secondary ml-1 font-mono text-[12px]">{lead.postal_code}</span></div>
                  )}
                </div>
              </div>
            )}
          </Card>
          </motion.div>

          {/* AI Notes */}
          <motion.div variants={staggerItem}>
          <Card
            title="AI Qualification Notes"
            actions={
              !editingNotes ? (
                <button
                  className="text-action"
                  onClick={() => { setEditingNotes(true); setEditNotes(lead.notes || lead.qualification_notes || ''); }}
                >
                  Edit
                </button>
              ) : null
            }
          >
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  className="input-field font-mono resize-y min-h-[120px]"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={5}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>Cancel</Button>
                  <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={handleNotesSave} loading={updateLead.isPending}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-secondary font-mono bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                {lead.notes || lead.qualification_notes || 'No qualification notes available'}
              </p>
            )}
          </Card>
          </motion.div>

          {/* Social & Competitor */}
          <motion.div variants={staggerItem}>
          <Card title="Social & Competitor Intel">
            {lead.social_networks && lead.social_networks.length > 0 ? (
              <div className="flex gap-1.5 flex-wrap mb-3">
                {lead.social_networks.map((sn) => (
                  <a
                    key={sn.id}
                    href={sn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip hover:text-white hover:bg-white/[0.06]"
                  >
                    {sn.platform} <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-tertiary font-mono mb-3">No social links found</p>
            )}
            {lead.competitor_intel && (
              <p className="text-[13px] text-secondary leading-relaxed">{lead.competitor_intel}</p>
            )}
          </Card>
          </motion.div>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-4">
          {/* Outreach Actions */}
          <motion.div variants={staggerItem}>
          <Card title={<><Send className="w-3.5 h-3.5" />Outreach</>}>
            <LeadOutreachActions
              leadId={lead.id}
              leadStatusHint={lead.status}
              hasEmailHint={Boolean(lead.email)}
              hasPhoneHint={Boolean(lead.phone)}
            />
          </Card>
          </motion.div>

          {/* Status */}
          <motion.div variants={staggerItem}>
          <Card title="Status">
            <div className="mb-3">{statusBadge(lead.status)}</div>
            <select
              value={editStatus || lead.status}
              onChange={(e) => setEditStatus(e.target.value)}
              className="input-field mb-3"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
              ))}
            </select>
            <Button size="sm" className="w-full" onClick={handleStatusSave} loading={updateLead.isPending} disabled={!editStatus || editStatus === lead.status}>
              Update Status
            </Button>
          </Card>
          </motion.div>

          {/* Sequence Stage */}
          <motion.div variants={staggerItem}>
          <Card title="Outreach Stage">
            <div className="flex gap-1.5 mb-2.5">
              {[0, 1, 2, 3].map((s) => {
                const reached = s <= (lead.follow_up_stage ?? lead.sequence_stage ?? 0);
                return (
                  <div
                    key={s}
                    className={cn(
                      'flex-1 h-1.5 rounded-full transition-colors duration-300',
                      reached ? 'bg-white' : 'bg-white/10',
                    )}
                  />
                );
              })}
            </div>
            <p className="text-[11px] font-mono text-tertiary">
              Stage {lead.follow_up_stage ?? lead.sequence_stage ?? 0} of 3
            </p>
          </Card>
          </motion.div>

          {/* Demo Website Status (only for no-website leads) */}
          {!lead.has_website && (
            <motion.div variants={staggerItem}>
            <Card title={<><Monitor className="w-3.5 h-3.5" />Demo Website</>}>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="chip">
                    {lead.demo_site_status || 'not_applicable'}
                  </span>
                  {(lead.demo_view_count ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-tertiary">
                      <Eye className="w-3 h-3" /> {lead.demo_view_count} views
                    </span>
                  )}
                </div>

                {lead.demo_site_status === 'generated' && (
                  <a
                    href={`/demo/${lead.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button size="sm" className="w-full" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                      Preview Demo
                    </Button>
                  </a>
                )}

                {(lead.demo_site_status === 'failed' || lead.demo_site_status === 'not_applicable') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    loading={regenerating}
                    onClick={async () => {
                      setRegenerating(true);
                      try {
                        await client.post(`/api/v1/leads/${lead.id}/demo-regenerate`);
                        toast.success('Demo regeneration started');
                      } catch {
                        toast.error('Failed to trigger regeneration');
                      } finally {
                        setRegenerating(false);
                      }
                    }}
                  >
                    {lead.demo_site_status === 'failed' ? 'Retry Generation' : 'Generate Demo'}
                  </Button>
                )}

                {lead.demo_generated_at && (
                  <p className="text-[10px] text-tertiary font-mono">
                    Generated · {formatDate(lead.demo_generated_at)}
                  </p>
                )}
              </div>
            </Card>
            </motion.div>
          )}

          {/* Directory Privacy */}
          <motion.div variants={staggerItem}>
          <Card title="Directory Privacy">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="privacy-toggle"
                className="w-4 h-4 mt-0.5 rounded bg-surface-2 border-white/15 text-white focus:ring-accent-ring accent-white"
                checked={lead.is_private_override || false}
                onChange={(e) => {
                  updateLead.mutate({ id: lead.id, payload: { is_private_override: e.target.checked } });
                }}
                disabled={updateLead.isPending}
              />
              <div>
                <label htmlFor="privacy-toggle" className="text-[13px] text-white font-medium block cursor-pointer">
                  Keep Private (Opt-out)
                </label>
                <p className="text-[11px] text-tertiary mt-1 leading-relaxed">
                  If checked, this lead will never appear in the public SEO directory.
                </p>
              </div>
            </div>

            {!lead.is_private_override && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-[11px] text-tertiary">
                  Status: <span className={cn('font-medium ml-1', lead.is_public ? 'text-success' : 'text-warning')}>
                    {lead.is_public ? 'Publicly Listed' : 'Exclusivity Window (30 Days)'}
                  </span>
                </p>
              </div>
            )}
          </Card>
          </motion.div>

          {/* Metadata */}
          <motion.div variants={staggerItem}>
          <Card title="Metadata">
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-tertiary">Created</span>
                <span className="font-mono text-secondary">{formatDate(lead.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-tertiary">Last Contacted</span>
                <span className="font-mono text-secondary">{formatDate(lead.last_contacted_at)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-tertiary">Lead ID</span>
                <span className="font-mono text-tertiary text-[10px] truncate min-w-0">{lead.id}</span>
              </div>
            </div>
          </Card>
          </motion.div>

          {/* Danger Zone */}
          <motion.div variants={staggerItem}>
          <Card className="border-white/[0.14]">
            <p className="eyebrow mb-3 text-white/80">Danger Zone</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full !text-white hover:!bg-white/[0.06]"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setShowDelete(true)}
            >
              Delete Lead
            </Button>
          </Card>
          </motion.div>
        </div>
      </motion.div>

      {/* Delete Modal */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete this lead?">
        <p className="text-secondary text-[13px] mb-5 leading-relaxed">
          You're about to delete <strong className="text-white">{lead.business_name}</strong>.
          This will remove the lead and its outreach history. This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowDelete(false)}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            loading={deleteLead.isPending}
            onClick={() => {
              deleteLead.mutate(lead.id, {
                onSuccess: () => {
                  setShowDelete(false);
                  navigate('/leads');
                }
              });
            }}
          >
            Delete Lead
          </Button>
        </div>
      </Modal>
    </motion.div>
  );
}
