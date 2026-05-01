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
  if (!lead) return <div className="text-center py-12 text-white/75 font-mono">Lead not found</div>;

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
        title={lead.business_name}
        subtitle={`${[lead.sub_area, lead.city, lead.region, lead.country].filter(Boolean).join(', ') || ''} · ${lead.category || ''}`}
        actions={
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/leads')}>
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
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="35" fill="none"
                    stroke={score >= 80 ? 'white' : score >= 60 ? '#999' : '#555'}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * 220} 220`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn('text-xl font-mono font-bold', score >= 80 ? 'text-white' : score >= 60 ? 'text-white/70' : 'text-white/70')}>
                    {score}
                  </span>
                </div>
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-xl font-bold tracking-tight text-white">{lead.business_name}</h2>
                <p className="text-white/75 text-sm">{[lead.sub_area, lead.city, lead.region, lead.country].filter(Boolean).join(', ')} · {lead.category}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  {statusBadge(lead.status)}
                  {lead.rating && (
                    <span className="flex items-center gap-1 text-xs text-white">
                      <Star className="w-3 h-3 fill-black" />
                      {lead.rating} ({lead.review_count} reviews)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
          </motion.div>

          {/* Business Info */}
          <motion.div variants={staggerItem}>
          <Card>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">Business Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-white/70" />
                  <span className="text-white/80">{lead.phone}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-white/70" />
                  <a href={`mailto:${lead.email}`} className="text-white hover:underline">{lead.email}</a>
                </div>
              )}
              {lead.website_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-4 h-4 text-white/70" />
                  <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline truncate">
                    {lead.website_url} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              )}
              {lead.google_maps_url && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-white/70" />
                  <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline">
                    Google Maps <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              )}
              {lead.latitude && lead.longitude && (
                <div className="flex items-center gap-2 text-sm">
                  <Map className="w-4 h-4 text-white/70" />
                  <a
                    href={`https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:underline font-mono text-xs"
                  >
                    {lead.latitude.toFixed(4)}, {lead.longitude.toFixed(4)} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              )}
            </div>
            {(lead.country || lead.region || lead.sub_area || lead.postal_code) && (
              <div className="mt-3 pt-3 border-t border-white/[0.08]">
                <h4 className="text-xs font-medium text-white/70 uppercase tracking-widest mb-2">Location Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {lead.country && (
                    <div><span className="text-white/70">Country:</span> <span className="text-white/80">{lead.country} {lead.country_code ? `(${lead.country_code})` : ''}</span></div>
                  )}
                  {lead.region && (
                    <div><span className="text-white/70">Region:</span> <span className="text-white/80">{lead.region}</span></div>
                  )}
                  {lead.sub_area && (
                    <div><span className="text-white/70">Sub-Area:</span> <span className="text-white/80">{lead.sub_area}</span></div>
                  )}
                  {lead.postal_code && (
                    <div><span className="text-white/70">Postal Code:</span> <span className="text-white/80">{lead.postal_code}</span></div>
                  )}
                </div>
              </div>
            )}
          </Card>
          </motion.div>

          {/* AI Notes */}
          <motion.div variants={staggerItem}>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest">AI Qualification Notes</h3>
              {!editingNotes && (
                <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(true); setEditNotes(lead.notes || lead.qualification_notes || ''); }}>
                  Edit
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  className="w-full bg-surface-2 border border-white/10 rounded-md p-3 text-sm text-white font-mono resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
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
              <p className="text-sm text-white/70 font-mono bg-surface-2 rounded-md p-3 whitespace-pre-wrap">
                {lead.notes || lead.qualification_notes || 'No qualification notes available'}
              </p>
            )}
          </Card>
          </motion.div>

          {/* Social & Competitor */}
          <motion.div variants={staggerItem}>
          <Card>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">Social & Competitor Intel</h3>
            {lead.social_networks && lead.social_networks.length > 0 ? (
              <div className="flex gap-2 flex-wrap mb-3">
                {lead.social_networks.map((sn) => (
                  <a
                    key={sn.id}
                    href={sn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-white/5 rounded-md text-xs font-mono text-white/80 hover:bg-white/10 transition-colors border border-white/10"
                  >
                    {sn.platform} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/70 font-mono mb-3">No social links found</p>
            )}
            {lead.competitor_intel && (
              <p className="text-sm text-white/70">{lead.competitor_intel}</p>
            )}
          </Card>
          </motion.div>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-4">
          {/* Outreach Actions */}
          <motion.div variants={staggerItem}>
          <Card>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">
              <Send className="w-3.5 h-3.5 inline mr-1.5" />Outreach
            </h3>
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
          <Card>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">Status</h3>
            <div className="mb-3">{statusBadge(lead.status)}</div>
            <select
              value={editStatus || lead.status}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full bg-surface-2 border border-white/10 rounded-md px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
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
          <Card>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">Outreach Stage</h3>
            <div className="flex gap-1 mb-2">
              {[0, 1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'flex-1 h-2 rounded-full',
                    s <= (lead.follow_up_stage ?? lead.sequence_stage ?? 0) ? 'bg-white' : 'bg-white/10',
                  )}
                />
              ))}
            </div>
            <p className="text-xs font-mono text-white/70">
              Stage {lead.follow_up_stage ?? lead.sequence_stage ?? 0} of 3
            </p>
          </Card>
          </motion.div>

          {/* Demo Website Status (only for no-website leads) */}
          {!lead.has_website && (
            <motion.div variants={staggerItem}>
            <Card>
              <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">
                <Monitor className="w-3.5 h-3.5 inline mr-1.5" />Demo Website
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-1 rounded-md text-xs font-mono font-medium',
                    lead.demo_site_status === 'generated' && 'bg-green-900/20 text-green-400 border border-green-800/30',
                    lead.demo_site_status === 'generating' && 'bg-yellow-900/20 text-yellow-400 border border-yellow-800/30',
                    lead.demo_site_status === 'pending' && 'bg-blue-900/20 text-blue-400 border border-blue-800/30',
                    lead.demo_site_status === 'failed' && 'bg-red-900/20 text-red-400 border border-red-800/30',
                    lead.demo_site_status === 'not_applicable' && 'bg-surface-2 text-white/75 border border-white/10',
                  )}>
                    {lead.demo_site_status || 'not_applicable'}
                  </span>
                  {(lead.demo_view_count ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-xs text-white/70">
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
                    variant="ghost"
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
                  <p className="text-[10px] text-white/70 font-mono">
                    Generated: {formatDate(lead.demo_generated_at)}
                  </p>
                )}
              </div>
            </Card>
            </motion.div>
          )}

          {/* Metadata */}
          <motion.div variants={staggerItem}>
          <Card>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-3">Metadata</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/70">Created</span>
                <span className="font-mono text-white/80">{formatDate(lead.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Last Contacted</span>
                <span className="font-mono text-white/80">{formatDate(lead.last_contacted_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Lead ID</span>
                <span className="font-mono text-white/75 text-[10px] truncate max-w-[120px]">{lead.id}</span>
              </div>
            </div>
          </Card>
          </motion.div>

          {/* Danger Zone */}
          <motion.div variants={staggerItem}>
          <Card className="border border-white/30">
            <h3 className="text-xs font-medium text-white uppercase tracking-widest mb-3">Danger Zone</h3>
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowDelete(true)}
            >
              Delete Lead
            </Button>
          </Card>
          </motion.div>
        </div>
      </motion.div>

      {/* Delete Modal */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Lead">
        <p className="text-white/75 text-sm mb-4">
          Are you sure you want to delete <strong className="text-white">{lead.business_name}</strong>?
          This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setShowDelete(false)}>Cancel</Button>
          <Button
            variant="danger"
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
            Delete
          </Button>
        </div>
      </Modal>
    </motion.div>
  );
}
