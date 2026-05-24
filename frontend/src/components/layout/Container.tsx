/**
 * Page-level content container.
 *
 * Single source of truth for the maximum reading width of dashboard pages.
 * Without a cap, hero text and tables stretch edge-to-edge on ultrawide
 * monitors, which reads as broken hierarchy. Each variant matches a
 * different content density:
 *
 *   prose    ~640px  — long-form articles, blog posts, documentation
 *   narrow   ~768px  — single-column forms (Profile, Settings panels)
 *   default  ~1240px — standard dashboard pages (Overview, Leads, Inbox)
 *   wide     ~1440px — data-dense surfaces (Pipeline log, Analytics charts)
 *   full     none    — opt out (modal contents, full-bleed embeds)
 *
 * The Shell already applies safe-area-aware horizontal padding (px-safe
 * with --safe-px set per breakpoint), so this component intentionally
 * does NOT re-add padding — it only constrains the max width and
 * centres the column.
 */
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type ContainerSize = 'prose' | 'narrow' | 'default' | 'wide' | 'full';

interface ContainerProps {
  children: ReactNode;
  size?: ContainerSize;
  className?: string;
}

const MAX_WIDTHS: Record<ContainerSize, string> = {
  prose: 'max-w-[640px]',
  narrow: 'max-w-[768px]',
  default: 'max-w-[1240px]',
  wide: 'max-w-[1440px]',
  full: '',
};

export default function Container({
  children,
  size = 'default',
  className,
}: ContainerProps) {
  return (
    <div className={cn('w-full mx-auto', MAX_WIDTHS[size], className)}>
      {children}
    </div>
  );
}
