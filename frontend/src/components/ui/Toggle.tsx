/**
 * Accessible Binary Switch Component.
 * 
 * Primarily used for administrative system toggles (e.g., Hold/Run).
 * Features animated transitions and customizable labels for each state.
 */
import { cn } from '../../lib/utils';

/**
 * Interface for Toggle component props.
 */
interface ToggleProps {
  /**
   * The current Boolean state of the toggle.
   */
  value: boolean;
  /**
   * Callback triggered when the switch position is toggled.
   * @param v The new state of the toggle.
   */
  onChange: (v: boolean) => void;
  /**
   * Label text shown in the 'true' state.
   */
  labelOn?: string;
  /**
   * Label text shown in the 'false' state.
   */
  labelOff?: string;
  /**
   * Background color class for the 'true' state.
   */
  colorOn?: string;
  /**
   * Background color class for the 'false' state.
   */
  colorOff?: string;
  /**
   * Interaction lock for the toggle.
   */
  disabled?: boolean;
}

/**
 * Toggle component.
 * 
 * Renders an accessible binary switch with animated transitions and customizable labels.
 * 
 * @param props Toggle component props.
 */
export default function Toggle({
  value,
  onChange,
  labelOn = 'RUN',
  labelOff = 'HOLD',
  colorOn = 'bg-success',
  colorOff = 'bg-white/[0.12]',
  disabled = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-8 w-20 items-center rounded-full transition-colors duration-300',
        'border border-white/[0.08]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        value ? colorOn : colorOff,
      )}
    >
      <span
        className={cn(
          'absolute left-1 flex h-6 w-6 items-center justify-center rounded-full bg-black shadow-md transition-transform duration-300',
          value && 'translate-x-12',
        )}
      />
      <span
        className={cn(
          'absolute text-[10px] font-mono font-bold tracking-wider transition-all',
          value ? 'left-2.5 text-black' : 'right-2 text-white/85',
        )}
      >
        {value ? labelOn : labelOff}
      </span>
    </button>
  );
}