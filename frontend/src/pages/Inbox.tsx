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

/**
 * The Inbox page manages email threads and AI intent classification.
 * 
 * This page acts as a centralized communication hub, allowing users to view incoming
 * replies from leads, filter them by AI-determined intent (e.g., Interested, Not Interested),
 * manually override the intent classification, and send direct replies to the lead.
 */
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
        <PageHeader title="Inbox" subtitle="Reply inbox — inbox endpoint may not be available yet" />
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm font-mono mb-4">
              Inbox endpoint unavailable. This feature requires backend support for the /inbox routes.
            </p>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Card>
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
        title="Reply Inbox"
        subtitle={`${threads?.length ?? 0} threads`}
        actions={
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Intent Filter */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <Card padding={true}>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={!intentFilter ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setIntentFilter('')}
          >
            All
          </Button>
          {Object.entries(INTENT_LABELS).map(([key, label]) => (
            <Button
              key={key}
              variant={intentFilter === key ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setIntentFilter(key as IntentLabel)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>
      </motion.div>

      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[400px]">
        {/* Thread List (1/3) */}
        <motion.div className="space-y-2 max-h-[600px] overflow-y-auto" variants={staggerContainer} initial="hidden" animate="visible">
          {(!threads || threads.length === 0) ? (
            <Card>
              <p className="text-gray-400 font-mono text-sm text-center">No threads found</p>
            </Card>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={cn(
                  'w-full text-left bg-white rounded-lg p-4 border transition-all hover:bg-gray-50',
                  selectedThread?.id === thread.id ? 'border-black shadow-sm' : 'border-gray-200',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-900 font-medium truncate">{thread.from_email || thread.lead_email}</span>
                  <Badge
                    label={thread.intent_label || 'unknown'}
                    variant={thread.intent_label === 'interested' ? 'green' : thread.intent_label === 'not_interested' ? 'red' : 'muted'}
                  />
                </div>
                <p className="text-xs text-gray-500 truncate">{thread.subject}</p>
                <p className="text-xs text-gray-400 mt-1 font-mono">{formatDate(thread.received_at)}</p>
              </button>
            ))
          )}
        </motion.div>

        {/* Thread Detail (2/3) */}
        <div className="lg:col-span-2">
          {!selectedThread ? (
            <Card className="h-full flex items-center justify-center">
              <p className="text-gray-400 font-mono text-sm">Select a thread to view details</p>
            </Card>
          ) : (
            <Card className="space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm md:text-base text-gray-900 font-semibold line-clamp-2">{selectedThread.subject}</h3>
                  <p className="text-[10px] md:text-xs text-gray-500 truncate">{selectedThread.from_email || selectedThread.lead_email}</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Tag className="w-3.5 h-3.5 text-gray-400" />
                  <select
                    value={selectedThread.intent_label}
                    onChange={(e) => handleUpdateIntent(selectedThread.id, e.target.value as IntentLabel)}
                    className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-[10px] md:text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
                  >
                    {Object.entries(INTENT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Body */}
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{selectedThread.body}</p>
              </div>

              {/* Reply */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-start gap-2">
                  <CornerDownRight className="w-4 h-4 text-gray-400 mt-2.5" />
                  <textarea
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-900 font-mono placeholder:text-gray-400 resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
                    placeholder="Type your reply..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end mt-3">
                  <Button
                    icon={<Send className="w-4 h-4" />}
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
