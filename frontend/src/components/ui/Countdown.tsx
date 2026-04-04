/**
 * Dynamic Countdown Timer Component.
 * 
 * Calculates and displays the remaining time until a specified ISO date string.
 * Automatically updates every second and formats the output into a human-readable
 * duration (e.g., "in 2h 15m 30s").
 */
import { useState, useEffect } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';

interface CountdownProps {
  /** The target ISO 8601 date string to count down towards */
  to: string | null;
}

export default function Countdown({ to }: CountdownProps) {
  const [display, setDisplay] = useState('—');

  useEffect(() => {
    if (!to) {
      return;
    }

    const update = () => {
      const target = parseISO(to);
      const now = new Date();
      const diff = differenceInSeconds(target, now);

      if (diff <= 0) {
        setDisplay('now');
        return;
      }

      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;

      if (h > 0) {
        setDisplay(`${h}h ${m}m ${s}s`);
      } else if (m > 0) {
        setDisplay(`${m}m ${s}s`);
      } else {
        setDisplay(`${s}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [to]);

  if (!to) {
    return <span className="font-mono text-black tabular-nums">—</span>;
  }

  return (
    <span className="font-mono text-black tabular-nums">
      {display !== '—' && display !== 'now' ? `in ${display}` : display}
    </span>
  );
}
