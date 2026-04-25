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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<string, string> = {
  primary: 'bg-white text-black hover:bg-gray-200 font-medium border border-white',
  secondary: 'bg-[#111111] text-white border border-white/10 hover:border-white/25 hover:bg-white/10 font-medium',
  danger: 'bg-[#111111] text-white border-2 border-white/20 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400 font-bold',
  ghost: 'bg-transparent text-[#A0A0A0] hover:text-white hover:bg-white/5',
  outline: 'bg-[#111111] text-white border border-white/10 hover:border-white/25 font-medium',
};

const sizes: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
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
        'ripple-container inline-flex items-center justify-center gap-2 rounded-md font-sans',
        'transition-colors duration-250',
        'disabled:opacity-50 disabled:cursor-not-allowed',
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
