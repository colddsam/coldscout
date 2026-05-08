import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'spf-dkim-dmarc-cold-email-deliverability',
  kind: 'guide',
  title: 'Email Deliverability: SPF, DKIM, and DMARC Explained',
  description:
    'Plain-English guide to setting up SPF, DKIM, and DMARC so your cold outreach actually lands in the primary inbox instead of spam.',
  publishedAt: '2026-05-07',
  readMinutes: 5,
  author: 'Samrat Kumar Das',
  category: 'Deliverability',
  isOutline: true,
  keywords: [
    'cold email deliverability',
    'SPF DKIM DMARC setup',
    'email authentication',
    'inbox placement',
    'B2B cold email',
  ],
  wordCount: 480,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Three DNS records decide whether your cold email lands in inbox or spam:
        SPF, DKIM, and DMARC. They are not optional in 2026 — Gmail, Yahoo, and
        Outlook now require them for any sender doing meaningful volume.
      </p>
      <h2>SPF — who is allowed to send?</h2>
      <p>
        A TXT record listing the IPs/services authorized to send mail "from" your
        domain. Misconfigure and your good mail gets rejected. Best practice: keep
        the lookup count under 10.
      </p>
      <h2>DKIM — was the message actually signed by you?</h2>
      <p>
        A cryptographic signature added to each outgoing message and verified
        against a public key in your DNS. Your ESP (Brevo, SendGrid, Postmark) gives
        you the record to publish.
      </p>
      <h2>DMARC — what should the receiver do if SPF/DKIM fail?</h2>
      <p>
        Policy record telling the receiver to <code>none</code>, <code>quarantine</code>,
        or <code>reject</code> failing mail, plus a <code>rua</code> reporting address.
        Start with <code>p=none</code> and watch the reports for a week before
        tightening to <code>quarantine</code>.
      </p>
      <h2>This article is a stub</h2>
      <p>
        The full version includes example records for Brevo, SendGrid, and Google
        Workspace, plus a debug checklist for "I just authenticated and mail still
        goes to spam". Coming soon.
      </p>
    </ArticleLayout>
  );
}
