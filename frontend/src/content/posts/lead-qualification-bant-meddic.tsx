import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'lead-qualification-bant-meddic-icp-scoring',
  kind: 'blog',
  title: 'Lead Qualification Frameworks: BANT, MEDDIC, and Modern ICP Scoring',
  description:
    'A side-by-side look at BANT, MEDDIC, CHAMP, and modern ICP-based scoring for B2B sales — when each one fits and how AI changes the game.',
  publishedAt: '2026-05-05',
  updatedAt: '2026-05-08',
  readMinutes: 5,
  author: 'Samrat Kumar Das',
  category: 'Sales Fundamentals',
  isOutline: true,
  keywords: [
    'lead qualification',
    'BANT',
    'MEDDIC',
    'CHAMP',
    'ICP scoring',
    'B2B sales qualification framework',
  ],
  wordCount: 500,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Qualification frameworks turn "is this a real opportunity?" into a structured
        question. Three are worth knowing — and one modern alternative.
      </p>
      <h2>BANT — Budget, Authority, Need, Timing</h2>
      <p>
        IBM's classic. Best for outbound where you need to disqualify quickly. Weakest
        when buyers don't yet know the budget (most early-stage SaaS).
      </p>
      <h2>MEDDIC — Metrics, Economic buyer, Decision criteria, Decision process, Identify pain, Champion</h2>
      <p>
        The enterprise standard. Heavy lift but unbeatable for six-figure deals where
        the buying group has 6–10 stakeholders.
      </p>
      <h2>CHAMP — Challenges, Authority, Money, Prioritization</h2>
      <p>
        BANT inverted — pain first, money last. Better fit for SMB / mid-market.
      </p>
      <h2>Modern ICP scoring</h2>
      <p>
        BANT/MEDDIC/CHAMP are conversation frameworks. ICP scoring is a quantitative
        layer that runs <em>before</em> the conversation, ranking leads by firmographics
        and triggering events so the human only spends time on the top decile. AI is
        especially good at this — it can read the prospect's website, social, and
        reviews and score against an ICP rubric in seconds.
      </p>
      <h2>This article is a stub</h2>
      <p>
        Full worked examples for each framework, with templated discovery questions
        and an ICP-scoring spreadsheet, are coming soon.
      </p>
    </ArticleLayout>
  );
}
