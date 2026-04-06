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
import { ArrowLeft, ExternalLink, MapPin, Phone, Mail, Star, Trash2, Globe, Save, Map, Monitor, RefreshCw, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { client } from '../lib/api';

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
  if (!lead) return <div className="text-center py-12 text-gray-500 font-mono">Lead not found</div>;

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
                  <circle cx="40" cy="40" r="35" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="35" fill="none"
                    stroke={score >= 80 ? 'black' : score >= 60 ? '#666' : '#ccc'}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * 220} 220`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn('text-xl font-mono font-bold', score >= 80 ? 'text-black' : score >= 60 ? 'text-gray-600' : 'text-gray-400')}>
                    {score}
                  </span>
                </div>
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-xl font-bold tracking-tight text-gray-900">{lead.business_name}</h2>
                <p className="text-gray-500 text-sm">{[lead.sub_area, lead.city, lead.region, lead.country].filter(Boolean).join(', ')} · {lead.category}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  {statusBadge(lead.status)}
                  {lead.rating && (
                    <span className="flex items-center gap-1 text-xs text-black">
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
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Business Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{lead.phone}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${lead.email}`} className="text-black hover:underline">{lead.email}</a>
                </div>
              )}
              {lead.website_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-black hover:underline truncate">
                    {lead.website_url} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              )}
              {lead.google_maps_url && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                    Google Maps <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              )}
              {lead.latitude && lead.longitude && (
                <div className="flex items-center gap-2 text-sm">
                  <Map className="w-4 h-4 text-gray-400" />
                  <a
                    href={`https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-black hover:underline font-mono text-xs"
                  >
                    {lead.latitude.toFixed(4)}, {lead.longitude.toFixed(4)} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              )}
            </div>
            {(lead.country || lead.region || lead.sub_area || lead.postal_code) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Location Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {lead.country && (
                    <div><span className="text-gray-400">Country:</span> <span className="text-gray-700">{lead.country} {lead.country_code ? `(${lead.country_code})` : ''}</span></div>
                  )}
                  {lead.region && (
                    <div><span className="text-gray-400">Region:</span> <span className="text-gray-700">{lead.region}</span></div>
                  )}
                  {lead.sub_area && (
                    <div><span className="text-gray-400">Sub-Area:</span> <span className="text-gray-700">{lead.sub_area}</span></div>
                  )}
                  {lead.postal_code && (
                    <div><span className="text-gray-400">Postal Code:</span> <span className="text-gray-700">{lead.postal_code}</span></div>
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
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest">AI Qualification Notes</h3>
              {!editingNotes && (
                <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(true); setEditNotes(lead.notes || lead.qualification_notes || ''); }}>
                  Edit
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  className="w-full bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-900 font-mono resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
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
              <p className="text-sm text-gray-600 font-mono bg-gray-50 rounded-md p-3 whitespace-pre-wrap">
                {lead.notes || lead.qualification_notes || 'No qualification notes available'}
              </p>
            )}
          </Card>
          </motion.div>

          {/* Social & Competitor */}
          <motion.div variants={staggerItem}>
          <Card>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Social & Competitor Intel</h3>
            {lead.social_networks && lead.social_networks.length > 0 ? (
              <div className="flex gap-2 flex-wrap mb-3">
                {lead.social_networks.map((sn) => (
                  <a
                    key={sn.id}
                    href={sn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-gray-100 rounded-md text-xs font-mono text-gray-700 hover:bg-gray-200 transition-colors border border-gray-200"
                  >
                    {sn.platform} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 font-mono mb-3">No social links found</p>
            )}
            {lead.competitor_intel && (
              <p className="text-sm text-gray-600">{lead.competitor_intel}</p>
            )}
          </Card>
          </motion.div>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-4">
          {/* Status */}
          <motion.div variants={staggerItem}>
          <Card>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Status</h3>
            <div className="mb-3">{statusBadge(lead.status)}</div>
            <select
              value={editStatus || lead.status}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 mb-3 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
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
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Outreach Stage</h3>
            <div className="flex gap-1 mb-2">
              {[0, 1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'flex-1 h-2 rounded-full',
                    s <= (lead.follow_up_stage ?? lead.sequence_stage ?? 0) ? 'bg-black' : 'bg-gray-200',
                  )}
                />
              ))}
            </div>
            <p className="text-xs font-mono text-gray-400">
              Stage {lead.follow_up_stage ?? lead.sequence_stage ?? 0} of 3
            </p>
          </Card>
          </motion.div>

          {/* Demo Website Status (only for no-website leads) */}
          {!lead.has_website && (
            <motion.div variants={staggerItem}>
            <Card>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">
                <Monitor className="w-3.5 h-3.5 inline mr-1.5" />Demo Website
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-1 rounded-md text-xs font-mono font-medium',
                    lead.demo_site_status === 'generated' && 'bg-green-50 text-green-700 border border-green-200',
                    lead.demo_site_status === 'generating' && 'bg-yellow-50 text-yellow-700 border border-yellow-200',
                    lead.demo_site_status === 'pending' && 'bg-blue-50 text-blue-700 border border-blue-200',
                    lead.demo_site_status === 'failed' && 'bg-red-50 text-red-700 border border-red-200',
                    lead.demo_site_status === 'not_applicable' && 'bg-gray-50 text-gray-500 border border-gray-200',
                  )}>
                    {lead.demo_site_status || 'not_applicable'}
                  </span>
                  {(lead.demo_view_count ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
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
                  <p className="text-[10px] text-gray-400 font-mono">
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
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Metadata</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Created</span>
                <span className="font-mono text-gray-700">{formatDate(lead.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Contacted</span>
                <span className="font-mono text-gray-700">{formatDate(lead.last_contacted_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Lead ID</span>
                <span className="font-mono text-gray-500 text-[10px] truncate max-w-[120px]">{lead.id}</span>
              </div>
            </div>
          </Card>
          </motion.div>

          {/* Danger Zone */}
          <motion.div variants={staggerItem}>
          <Card className="border border-black">
            <h3 className="text-xs font-medium text-black uppercase tracking-widest mb-3">Danger Zone</h3>
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
        <p className="text-gray-500 text-sm mb-4">
          Are you sure you want to delete <strong className="text-gray-900">{lead.business_name}</strong>?
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
