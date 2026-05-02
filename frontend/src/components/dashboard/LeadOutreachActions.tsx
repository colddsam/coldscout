/**
 * Per-lead outreach action controls.
 *
 * Renders the right button(s) for a single lead based on its current
 * outreach state — exposed by the backend's ``/leads/{id}/outreach-state``
 * endpoint. Every interactive surface lives here so both the Leads CRM
 * table row and the Lead Detail sidebar share identical semantics.
 *
 * Button states
 * -------------
 * • ``eligible``     → "Send Now" (green CTA) for qualified email leads.
 * • ``in_flight``    → "Queued…" / "Sending…" disabled chip while the
 *                       single-lead job sits in the shared serial queue.
 * • ``locked``       → "Sent" disabled chip + Unlock icon next to it that
 *                       resets the lead status so the CTA returns.
 * • ``failed``       → "Retry" CTA + the error tooltip on the Unlock icon.
 * • ``phone_only``   → WhatsApp deep link with a prefilled message.
 * • ``not_eligible`` → Disabled placeholder so the column never collapses.
 *
 * Layout is responsive: when ``compact`` is true (table rows) the
 * component renders a single-line, narrow action group; otherwise it
 * renders a stacked block suitable for the LeadDetail sidebar.
 */
import type { MouseEvent } from 'react';
import { Loader2, MessageCircle, Send, Unlock, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';
import { cn } from '../../lib/utils';
import {
  useLeadOutreachState,
  useTriggerLeadOutreach,
  useUnlockLeadOutreach,
} from '../../hooks/useLeads';
import { getLeadWhatsappLink } from '../../lib/api';
import toast from 'react-hot-toast';

export interface LeadOutreachActionsProps {
  leadId: string;
  /** Hint of the lead's current status — used so the first render shows
   *  the right control before the outreach-state query resolves. */
  leadStatusHint?: string | null;
  hasEmailHint?: boolean;
  hasPhoneHint?: boolean;
  /** Render in compact (table-row) layout when true. */
  compact?: boolean;
  className?: string;
}

export default function LeadOutreachActions({
  leadId,
  leadStatusHint,
  hasEmailHint,
  hasPhoneHint,
  compact = false,
  className,
}: LeadOutreachActionsProps) {
  const { data, isLoading } = useLeadOutreachState(leadId);
  const trigger = useTriggerLeadOutreach();
  const unlock = useUnlockLeadOutreach();

  // Stop row-level click handlers (e.g. table-row navigation) when the
  // user interacts with this component.
  const stop = (e: MouseEvent) => e.stopPropagation();

  // Optimistic resolution: while the first state fetch is in flight, fall
  // back to the lead's status hint so the column never flashes empty.
  const buttonState = data?.button_state ?? guessFromHint(leadStatusHint, hasEmailHint, hasPhoneHint);

  const baseClass = compact ? 'flex items-center gap-1.5' : 'flex flex-col gap-2';

  // Phone-qualified leads → WhatsApp button. We fetch the link lazily so
  // the message body is always assembled with fresh lead signals.
  if (buttonState === 'phone_only') {
    const handleWhatsapp = async (e: MouseEvent) => {
      stop(e);
      try {
        const link = await getLeadWhatsappLink(leadId);
        // Open in a new tab so the Leads page state is preserved.
        window.open(link.url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to build WhatsApp link';
        toast.error(msg);
      }
    };
    return (
      <div className={cn(baseClass, className)} onClick={stop}>
        <Button
          size="sm"
          variant="primary"
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          onClick={handleWhatsapp}
          className={cn(
            'bg-white text-black hover:bg-white/90 border-white/40',
            compact && 'min-w-[120px]',
          )}
        >
          WhatsApp
        </Button>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className={cn(baseClass, className)} onClick={stop}>
        <Button size="sm" variant="ghost" disabled className={compact ? 'min-w-[120px]' : 'w-full'}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </Button>
      </div>
    );
  }

  // Eligible / Failed → primary CTA. Failed shares the layout but uses a
  // "Retry" label and warning hint so the user understands the prior run
  // didn't succeed.
  if (buttonState === 'eligible' || buttonState === 'failed') {
    const isRetry = buttonState === 'failed';
    return (
      <div className={cn(baseClass, className)} onClick={stop}>
        <Button
          size="sm"
          variant="primary"
          loading={trigger.isPending}
          icon={isRetry ? <RefreshCw className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          onClick={(e) => { stop(e); trigger.mutate(leadId); }}
          className={cn(compact && 'min-w-[120px]')}
        >
          {isRetry ? 'Retry Send' : 'Send Now'}
        </Button>
        {isRetry && data?.manual_error && !compact && (
          <p className="text-[11px] text-white/60 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-[1px] flex-shrink-0" />
            <span className="truncate" title={data.manual_error}>
              {data.manual_error}
            </span>
          </p>
        )}
      </div>
    );
  }

  if (buttonState === 'in_flight') {
    const status = data?.manual_status ?? 'queued';
    const label = status === 'running' ? 'Sending…' : 'Queued…';
    const queuePos = data?.queue_position;
    return (
      <div className={cn(baseClass, className)} onClick={stop}>
        <Button
          size="sm"
          variant="secondary"
          disabled
          icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
          className={cn(compact && 'min-w-[120px]')}
        >
          {label}
        </Button>
        {!compact && queuePos != null && status === 'queued' && (
          <p className="text-[11px] text-white/60">
            Position {queuePos} in the queue
          </p>
        )}
      </div>
    );
  }

  if (buttonState === 'locked') {
    return (
      <div className={cn(baseClass, className)} onClick={stop}>
        <div className={cn('flex items-center gap-1.5', !compact && 'w-full')}>
          <Button
            size="sm"
            variant="secondary"
            disabled
            icon={<Lock className="w-3.5 h-3.5" />}
            className={cn(compact ? 'min-w-[100px]' : 'flex-1')}
          >
            Sent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={unlock.isPending}
            icon={<Unlock className="w-3.5 h-3.5" />}
            onClick={(e) => { stop(e); unlock.mutate(leadId); }}
            title="Unlock to allow another send"
            className="px-2"
          >
            <span className="sr-only">Unlock</span>
          </Button>
        </div>
        {!compact && (
          <p className="text-[11px] text-white/60">
            Unlock to re-trigger personalization + outreach for this lead.
          </p>
        )}
      </div>
    );
  }

  // not_eligible — show a compact placeholder so the table column doesn't
  // collapse and the user understands why the button isn't available.
  return (
    <div className={cn(baseClass, className)} onClick={stop}>
      <Button
        size="sm"
        variant="ghost"
        disabled
        className={cn(compact ? 'min-w-[120px]' : 'w-full', 'opacity-60')}
      >
        Not eligible
      </Button>
    </div>
  );
}

/**
 * First-render fallback so the table doesn't flash a generic spinner when
 * we already know enough about the lead to pick the correct control.
 */
function guessFromHint(
  status: string | null | undefined,
  hasEmail: boolean | undefined,
  hasPhone: boolean | undefined,
) {
  if (status === 'phone_qualified' && hasPhone) return 'phone_only' as const;
  if (status === 'qualified' && (hasEmail ?? true)) return 'eligible' as const;
  const locked = new Set([
    'queued_for_send', 'email_sent', 'opened', 'clicked',
    'replied', 'bounced', 'unsubscribed', 'rejected',
  ]);
  if (status && locked.has(status)) return 'locked' as const;
  return 'not_eligible' as const;
}
