/**
 * Interactive Button Component.
 *
 * Configurable action element with semantic styles, sizes, ripple effect,
 * and an integrated loading state for async operations.
 */
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode, MouseEvent } from 'react';
import { useCallback, useRef } from 'react';

type MotionConflicts = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, MotionConflicts> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<string, string> = {
  primary:
    'bg-white text-black hover:bg-[#E5E5E5] font-medium border border-white shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_4px_12px_rgba(0,0,0,0.4)]',
  accent:
    'bg-accent text-white hover:bg-accent-hover font-medium border border-accent/40 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_16px_rgba(124,122,237,0.3)]',
  secondary:
    'bg-[#121212] text-white border border-white/10 hover:border-white/22 hover:bg-white/[0.06] font-medium',
  danger:
    'bg-[#121212] text-white/90 border border-red-500/25 hover:bg-red-500/10 hover:border-red-500/45 hover:text-red-300 font-medium',
  ghost:
    'bg-transparent text-[#B0B0B0] hover:text-white hover:bg-white/[0.06]',
  outline:
    'bg-transparent text-white border border-white/12 hover:border-white/25 hover:bg-white/[0.04] font-medium',
};

const sizes: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs h-8',
  md: 'px-4 py-2 text-sm h-9',
  lg: 'px-5 py-2.5 text-sm h-11',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      // Ripple effect
      const btn = btnRef.current;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        ripple.className = 'ripple';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      }
      onClick?.(e);
    },
    [onClick],
  );

  return (
    <motion.button
      ref={btnRef}
      whileHover={disabled || loading ? undefined : { scale: 1.01 }}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={cn(
        'ripple-container inline-flex items-center justify-center gap-2 rounded-lg font-sans whitespace-nowrap',
        'transition-all duration-200 ease-out',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-current',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        icon && (
          <span
            className={cn(
              size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4',
              'flex items-center justify-center -ml-0.5',
            )}
          >
            {icon}
          </span>
        )
      )}
      {children}
    </motion.button>
  );
}
