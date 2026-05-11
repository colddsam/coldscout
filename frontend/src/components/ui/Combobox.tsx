/**
 * Themed Combobox with built-in "Other" (manual entry) support.
 *
 * Behaviors
 * ---------
 * - Click the trigger → opens a panel with a search field + filtered options.
 * - First option is always "Other (type custom value)" so freelancers can
 *   enter values that aren't in the dataset.
 * - Picking "Other" switches the row to a plain text input; a small
 *   "← back to dropdown" affordance restores list mode.
 * - When the bound ``value`` exists in the options list, list mode is
 *   shown with that option highlighted. When it doesn't, custom-text
 *   mode is auto-selected so existing free-text values backfill cleanly.
 * - Disabled when ``disabled`` is true (used for cascading: city locked
 *   until state is picked, etc.).
 *
 * Edge cases
 * ----------
 * - Empty options list: only the "Other" path is offered, with a hint.
 * - Long lists: search filter + scroll container with max-height.
 * - Click outside / Escape: closes the dropdown without changing value.
 * - Mobile: full-width panel, large touch targets.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Edit3, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

interface ComboboxProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  disabledHint?: string;
  emptyMessage?: string;
  /** When true, picking 'Other' is supported. Default true. */
  allowOther?: boolean;
  /** Override the label shown for the "Other" entry. */
  otherLabel?: string;
  /** Required marker shown in the label. */
  required?: boolean;
  /** Optional id-friendly label for the search input. */
  searchPlaceholder?: string;
}

export default function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  disabledHint,
  emptyMessage,
  allowOther = true,
  otherLabel = 'Other (type custom value)',
  required = false,
  searchPlaceholder = 'Search…',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Custom-text mode: triggered when the user picked "Other" OR the
  // current value isn't in the option list (so free-text backfill from
  // pre-existing data works without forcing the user back to a dropdown).
  const valueInOptions = useMemo(
    () => options.some((o) => o.value === value),
    [options, value],
  );

  const [customMode, setCustomMode] = useState<boolean>(
    () => allowOther && !!value && !valueInOptions,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recompute custom-mode when the option set or value pivots externally.
  // We DON'T do this in an effect (anti-pattern) — instead derive it via
  // a render-time reset keyed on (options, value) identity changes that
  // matter.
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const currentKey = `${options.length}::${value}`;
  if (seedKey !== currentKey) {
    setSeedKey(currentKey);
    if (allowOther) {
      // Don't override the user's deliberate Custom selection by flipping
      // back to list mode if the value happens to NOT be in the options
      // list — but DO flip into custom mode when value is non-empty and
      // not in options (e.g. "I selected Other and typed something").
      if (value && !valueInOptions && !customMode) {
        setCustomMode(true);
      } else if (!value && customMode) {
        // Cleared externally → back to list mode.
        setCustomMode(false);
      }
    }
  }

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const selectedLabel =
    options.find((o) => o.value === value)?.label || (value && !customMode ? value : '');

  // ── Custom (free-text) mode ────────────────────────────────────────────
  if (customMode) {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-xs font-medium text-secondary">
            {label} {required && <span className="text-danger">*</span>}
            <span className="ml-2 text-[10px] uppercase tracking-wider text-accent/80">
              Custom
            </span>
          </label>
        )}
        <div
          className={cn(
            'flex items-center gap-1.5 bg-black/40 border rounded-md px-2 py-1.5',
            disabled
              ? 'opacity-50 border-white/[0.06] cursor-not-allowed'
              : 'border-accent/30 focus-within:border-accent/60',
          )}
        >
          <Edit3 className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-secondary/60 focus:outline-none min-w-0"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setCustomMode(false);
              }}
              className="text-secondary hover:text-white transition-colors text-xs whitespace-nowrap"
              title="Back to dropdown"
            >
              ← list
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── List (dropdown) mode ───────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative space-y-1">
      {label && (
        <label className="block text-xs font-medium text-secondary">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2 bg-black/40 border rounded-md px-3 py-2 text-sm text-left transition-colors',
          disabled
            ? 'opacity-50 border-white/[0.06] cursor-not-allowed text-secondary'
            : open
              ? 'border-accent/60 text-white'
              : 'border-white/[0.1] text-white hover:border-white/[0.2]',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={disabled ? disabledHint : undefined}
      >
        <span className={cn('truncate', !selectedLabel && 'text-secondary/70')}>
          {selectedLabel || (disabled && disabledHint) || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 flex-shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && !disabled && (
        <div
          className={cn(
            'absolute z-30 mt-1 left-0 right-0 bg-surface-3 border border-white/[0.12] rounded-md shadow-lg',
            'shadow-[0_8px_24px_rgba(0,0,0,0.5)]',
          )}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/[0.08]">
            <Search className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-secondary/60 focus:outline-none min-w-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-secondary hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {/* Other (always at top) */}
            {allowOther && (
              <button
                type="button"
                onClick={() => {
                  setCustomMode(true);
                  setOpen(false);
                  setQuery('');
                  onChange(''); // start with empty, user types in
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/[0.08] transition-colors border-b border-white/[0.06]"
              >
                <Edit3 className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="text-accent">{otherLabel}</span>
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-secondary text-center">
                {options.length === 0
                  ? emptyMessage || 'No options available — pick "Other" above.'
                  : 'No matches. Try a different search or pick "Other".'}
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value && !customMode;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery('');
                      setCustomMode(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors',
                      isSelected
                        ? 'bg-accent/[0.12] text-white'
                        : 'text-white hover:bg-white/[0.05]',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[10px] uppercase tracking-wider text-secondary flex-shrink-0">
                        {opt.hint}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
