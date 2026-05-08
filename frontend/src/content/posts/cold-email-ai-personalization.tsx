import { Link } from 'react-router-dom';
import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'cold-email-ai-personalization-at-scale',
  kind: 'blog',
  title: 'Cold Email AI: How to Generate Personalized Outreach at Scale',
  description:
    'A practical playbook for using LLMs to write cold emails that actually feel personal — covering data inputs, prompts, deliverability, and CAN-SPAM compliance.',
  publishedAt: '2026-05-02',
  updatedAt: '2026-05-08',
  readMinutes: 8,
  author: 'Samrat Kumar Das',
  category: 'Outreach',
  keywords: [
    'cold email AI generator',
    'AI personalized outreach',
    'cold email automation',
    'B2B email writing',
    'CAN-SPAM compliance',
    'cold email deliverability',
  ],
  wordCount: 1250,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        AI-written cold email is either the highest-leverage outreach channel of the
        decade or the fastest way to land your domain on a blocklist. The deciding
        factor is not the model you use — it's the data you put in front of it.
      </p>

      <h2>The 80/20 rule of AI cold email</h2>
      <p>
        Most failed AI emails fail at the same step: they generate without context.
        A well-tuned 7B-parameter model with rich context outperforms GPT-4 with no
        context every time. So the first job isn't picking the model — it's
        assembling the brief.
      </p>

      <h2>The minimum viable brief</h2>
      <p>For each prospect, hand the model these fields:</p>
      <ul>
        <li><strong>Prospect name and role</strong> — pulled from the website's About / Team page or LinkedIn.</li>
        <li><strong>Business name and one-liner</strong> — from the website meta description and H1.</li>
        <li><strong>One specific detail</strong> — a recent blog post, a service they highlight, a review quote, an Instagram theme.</li>
        <li><strong>Your offer</strong> — what you sell, in 15 words.</li>
        <li><strong>Your shared context</strong> — same city? Same vertical? Mutual contact?</li>
        <li><strong>The desired CTA</strong> — book a call? Reply yes/no? Try a free demo?</li>
      </ul>

      <h2>A prompt template that works</h2>
      <pre><code>{`You write 90-word cold emails. Constraints:
- Tone: human, conversational, no superlatives
- Open with a one-sentence reference to the SPECIFIC DETAIL provided
- One sentence on why you reached out (tie to MY OFFER)
- One soft CTA — a question, not a demand
- Sign off as MY NAME
- Never use "Hope this finds you well", "I came across", or "synergy"
- Never invent facts about the prospect

PROSPECT: {{prospect_name}}, {{prospect_role}} at {{business_name}}
BUSINESS: {{business_one_liner}}
SPECIFIC DETAIL: {{specific_detail}}
MY OFFER: {{offer}}
SHARED CONTEXT: {{shared_context}}
CTA: {{cta}}
MY NAME: {{my_name}}`}</code></pre>
      <p>
        Notice what's not there: industry templates, "value props", buzzword lists.
        The constraint is to stay close to the data. The model is good at writing.
        It is bad at making things up — so don't ask it to.
      </p>

      <h2>Where the data actually comes from</h2>
      <ol>
        <li>
          <strong>The prospect's website.</strong> Title, meta, H1, the first 1,500 chars
          of body text, the team/about page if present.
        </li>
        <li>
          <strong>Public review platforms.</strong> One representative recent review (Maps,
          Yelp, Google reviews) — never paste verbatim, but distill the theme.
        </li>
        <li>
          <strong>Social profiles.</strong> The most recent 3 posts on Instagram or
          LinkedIn often surface what they're proud of right now.
        </li>
        <li>
          <strong>Your CRM.</strong> Have you (or someone on your team) ever talked to
          them? Don't restart the conversation.
        </li>
      </ol>

      <h2>The deliverability layer</h2>
      <p>
        Personalization gets you opens. Deliverability gets you delivered. The non-negotiables:
      </p>
      <ul>
        <li><strong>SPF, DKIM, DMARC</strong> all aligned on the sending domain.</li>
        <li><strong>A warmed sender</strong>. New domain → 2 weeks of low-volume warming before scaling.</li>
        <li><strong>List hygiene</strong>. Hard bounces auto-suppressed. Soft bounces capped.</li>
        <li><strong>Volume caps</strong>. Stay under 100/day per inbox until reputation is established.</li>
      </ul>
      <p>
        Cold Scout sends through Brevo (Sendinblue) for exactly this reason — managed
        IP reputation and explicit unsubscribe handling.
      </p>

      <h2>The compliance layer</h2>
      <p>
        Even an artisanally personalized email is commercial outreach. Two requirements
        you cannot skip:
      </p>
      <ol>
        <li>
          <strong>One-click unsubscribe</strong>. Honored within 10 business days under
          CAN-SPAM, immediately under GDPR. Cold Scout adds an unsubscribe footer to
          every email automatically.
        </li>
        <li>
          <strong>Physical mailing address</strong> in the email. CAN-SPAM mandate.
        </li>
      </ol>
      <p>
        For EU-based recipients you also need a defensible legal basis. Most B2B cold
        email rests on legitimate interest, but document the reasoning per campaign.
      </p>

      <h2>Measure the right thing</h2>
      <p>
        Open rate is gameable (Apple Mail Privacy fires opens automatically). The
        signal you actually care about is <strong>reply rate</strong>, segmented by
        intent — interested, not interested, unsubscribe, other. Cold Scout's inbox
        classifier auto-tags incoming replies with these labels so you can tune the
        prompt against actual outcomes.
      </p>

      <h2>Two things AI cold email is bad at (and how to compensate)</h2>
      <ul>
        <li>
          <strong>Knowing when not to send.</strong> A human can tell when a target's
          recent layoff is a "send later" signal. The AI can't. Build a soft-block
          for triggers like layoffs, acquisitions, leadership changes — pause those
          targets for 30–60 days.
        </li>
        <li>
          <strong>Recent factual claims.</strong> Don't ask the model to claim "we just
          shipped X". Inject those facts at the prompt level, never let the model
          invent them.
        </li>
      </ul>

      <p>
        If you want to skip the plumbing, the entire pipeline above ships in
        <Link to="/"> Cold Scout</Link> — open source if you want to own it, hosted
        if you want to skip the deploy.
      </p>
    </ArticleLayout>
  );
}
