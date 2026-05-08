/**
 * Dynamic post resolver — handles both /blog/:slug and /guides/:slug.
 *
 * Each route mounts this component with a fixed `kind`. We look up the entry
 * in the registry, render it through ArticleLayout (which supplies SEO + JSON-LD),
 * or fall through to NotFound if the slug doesn't exist.
 */
import { useParams } from 'react-router-dom';
import { findBySlug } from '../content';
import NotFound from './NotFound';
import type { ContentKind } from '../content/types';

export default function Post({ kind }: { kind: ContentKind }) {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NotFound />;

  const entry = findBySlug(kind, slug);
  if (!entry) return <NotFound />;

  const { Component } = entry;
  return <Component />;
}
