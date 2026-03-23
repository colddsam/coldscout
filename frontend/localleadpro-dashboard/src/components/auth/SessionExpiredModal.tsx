import React from 'react';
import { LogOut } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuth } from '../../hooks/useAuth';

/**
 * Global session expiration notification modal.
 * Informed by the `isSessionExpired` state from `AuthContext`, usually triggered
 * by a 401/403 API response via the global event listener in `AuthProvider`.
 */
const SessionExpiredModal: React.FC = () => {
  const { isSessionExpired, logout } = useAuth();

  return (
    <Modal
      open={isSessionExpired}
      onClose={logout}
      title="Session Expired"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col items-center text-center space-y-4 py-2">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
          <LogOut className="w-6 h-6 text-red-500" />
        </div>
        
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            For your security, your session has expired due to inactivity or invalid credentials.
          </p>
          <p className="text-sm font-medium text-black">
            Please log in again to continue managing your lead generation pipeline.
          </p>
        </div>

        <button
          onClick={logout}
          className="w-full mt-4 py-2.5 px-4 bg-black text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
        >
          Proceed to Login
        </button>
      </div>
    </Modal>
  );
};

export default SessionExpiredModal;
