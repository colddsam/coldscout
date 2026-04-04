import React from 'react';
import { cn } from '../../lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  forceShowText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Logo: React.FC<LogoProps> = ({ 
  className, 
  showText = true,
  forceShowText = false,
  size = 'md' 
}) => {
  const siteName = import.meta.env.VITE_SITE_NAME || 'Local Lead Pro';
  
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-14 w-14'
  };

  const textClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl'
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img 
        src="/favicon.svg" 
        alt={siteName} 
        className={cn(sizeClasses[size], "object-contain")}
      />
      {showText && (
        <span className={cn(
          "font-bold tracking-tight text-slate-900 dark:text-white truncate",
          !forceShowText && "hidden sm:block", // Hide on mobile unless forced
          "md:block", // Ensure visible on desktop
          textClasses[size]
        )}>
          {siteName}
        </span>
      )}
    </div>
  );
};

export default Logo;
