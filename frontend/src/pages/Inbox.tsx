import { useState } from 'react';
import { motion } from 'framer-motion';
import { useInbox, useRespondToThread, useUpdateThreadIntent } from '../hooks/useInbox';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import PageHeader from '../components/layout/PageHeader';
import { formatDate, cn } from '../lib/utils';
import { INTENT_LABELS } from '../lib/constants';
import { pageTransition, staggerContainer, fadeInUp, defaultViewport } from '../lib/motion';
import type { InboxThread, IntentLabel } from '../lib/api';
import { Send, CornerDownRight, Tag, RefreshCw } from 'lucide-react';
import { EmptyInbox } from '../components/ui/Illustration';

export default function Inbox() {
  const [intentFilter, setIntentFilter] = useState<IntentLabel | ''>('');
  const { data: threads, isLoading, error, refetch } = useInbox(
    intentFilter ? { intent: intentFilter as IntentLabel } : undefined
  );
  const respondMutation = useRespondToThread();
  const intentMutation = useUpdateThreadIntent();
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);
  const [replyBody, setReplyBody] = useState('');

  if (isLoading) return <PageLoader />;

  if (error) {
    return (
      <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
        <PageHeader eyebrow="Inbox" title="Reply Inbox" subtitle="Inbox endpoint not available" />
        <div className="empty-state">
          <EmptyInbox size={84} />
          <p className="heading-section mt-4 mb-2">Inbox endpoint unavailable</p>
          <p className="text-meta mb-5 max-w-md">This feature requires backend support for the /inbox routes.</p>
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </motion.div>
    );
  }

  const handleSendReply = () => {
    if (!selectedThread || !replyBody.trim()) return;
    respondMutation.mutate(
      { id: selectedThread.id, body: replyBody },
      { onSuccess: () => setReplyBody('') },
    );
  };

  const handleUpdateIntent = (threadId: string, intent: IntentLabel) => {
    intentMutation.mutate({ id: threadId, intent });
  };

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Inbox"
        title="Reply Inbox"
        subtitle={`${threads?.length ?? 0} threads · AI-classified by intent.`}
        actions={
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Intent Filter (segmented) */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <div className="segmented w-full overflow-x-auto">
          <button
            type="button"
            className={cn('segmented-item', !intentFilter && 'is-active')}
            onClick={() => setIntentFilter('')}
          >
            All
          </button>
          {Object.entries(INTENT_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn('segmented-item', intentFilter === key && 'is-active')}
              onClick={() => setIntentFilter(key as IntentLabel)}
            >
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[400px]">
          {/* Thread List (1/3) */}
          <motion.div className="space-y-2 max-h-[600px] overflow-y-auto pr-1" variants={staggerContainer} initial="hidden" animate="visible">
            {(!threads || threads.length === 0) ? (
              <div className="empty-state">
                <EmptyInbox size={72} />
                <p className="text-meta mt-3">No threads found</p>
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={cn(
                    'w-full text-left rounded-lg p-3 border transition-all duration-200',
                    selectedThread?.id === thread.id
                      ? 'border-white/20 bg-white/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.035]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13px] text-white font-medium truncate">{thread.from_email || thread.lead_email}</span>
                    <Badge
                      label={thread.intent_label || 'unknown'}
                      variant={thread.intent_label === 'interested' ? 'green' : thread.intent_label === 'not_interested' ? 'red' : 'muted'}
                    />
                  </div>
                  <p className="text-[12px] text-secondary truncate">{thread.subject}</p>
                  <p className="text-[10px] text-tertiary mt-1.5 font-mono">{formatDate(thread.received_at)}</p>
                </button>
              ))
            )}
          </motion.div>

          {/* Thread Detail (2/3) */}
          <div className="lg:col-span-2">
            {!selectedThread ? (
              <Card className="h-full flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <EmptyInbox size={72} className="text-white/40 mx-auto" />
                  <p className="text-meta mt-3">Select a thread to view details</p>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="heading-section line-clamp-2">{selectedThread.subject}</h3>
                    <p className="text-[12px] text-tertiary truncate mt-0.5 font-mono">{selectedThread.from_email || selectedThread.lead_email}</p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Tag className="w-3.5 h-3.5 text-tertiary" />
                    <select
                      value={selectedThread.intent_label}
                      onChange={(e) => handleUpdateIntent(selectedThread.id, e.target.value as IntentLabel)}
                      className="input-field !py-1 !px-2 !text-xs w-auto"
                    >
                      {Object.entries(INTENT_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 max-h-72 overflow-y-auto">
                  <p className="text-[13px] text-secondary whitespace-pre-wrap font-mono leading-relaxed">{selectedThread.body}</p>
                </div>

                <div className="border-t border-white/[0.06] pt-4 mt-4">
                  <div className="flex items-start gap-2">
                    <CornerDownRight className="w-4 h-4 text-tertiary mt-2.5 flex-shrink-0" />
                    <textarea
                      className="input-field font-mono resize-y min-h-[88px]"
                      placeholder="Type your reply…"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end mt-3">
                    <Button
                      size="sm"
                      icon={<Send className="w-3.5 h-3.5" />}
                      onClick={handleSendReply}
                      loading={respondMutation.isPending}
                      disabled={!replyBody.trim()}
                    >
                      Send Reply
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
