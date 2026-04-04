/**
 * Global Notification Utilities.
 * 
 * Thin wrapper around `react-hot-toast` to provide consistent, themed messaging
 * for successes, errors, and general informational updates.
 */
import toast from 'react-hot-toast';

/** Displays a green success notification */
export const showSuccess = (msg: string) => toast.success(msg);
/** Displays a red error notification with message detail */
export const showError = (msg: string) => toast.error(msg);
/** Displays a blue informational notification with an icon */
export const showInfo = (msg: string) => toast(msg, { icon: 'ℹ️' });

export default toast;
