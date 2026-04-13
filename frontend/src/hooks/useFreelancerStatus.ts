import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFreelancerStatus,
  updateFreelancerStatus,
  updateFreelancerStatusAdmin,
  type FreelancerProductionStatus,
} from '../lib/api';
import { broadcastPipelineStatusChange } from '../lib/realtime';
import toast from 'react-hot-toast';

/**
 * Fetches the current freelancer's pipeline production status.
 * Superusers also receive the full list of all freelancer statuses.
 */
export function useFreelancerStatus(refetchInterval?: number) {
  return useQuery({
    queryKey: ['freelancer-status'],
    queryFn: getFreelancerStatus,
    refetchInterval: refetchInterval ?? 30000,
  });
}

/**
 * Mutation to update the current freelancer's pipeline production status.
 */
export function useUpdateFreelancerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: FreelancerProductionStatus) =>
      updateFreelancerStatus({ production_status: status }),
    onSuccess: (data) => {
      const label = data.production_status === 'HOLD' ? 'paused' : 'resumed';
      toast.success(`Your pipeline has been ${label}`);
      qc.invalidateQueries({ queryKey: ['freelancer-status'] });
      broadcastPipelineStatusChange({ scope: 'freelancer', user_id: data.user_id });
    },
    onError: (err: Error) => {
      toast.error(`Failed to update status: ${err.message}`);
    },
  });
}

/**
 * Admin mutation to update any freelancer's pipeline production status.
 */
export function useUpdateFreelancerStatusAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: FreelancerProductionStatus }) =>
      updateFreelancerStatusAdmin(userId, { production_status: status }),
    onSuccess: (data) => {
      const label = data.production_status === 'HOLD' ? 'paused' : 'resumed';
      toast.success(`Freelancer ${data.user_id} pipeline ${label}`);
      qc.invalidateQueries({ queryKey: ['freelancer-status'] });
      broadcastPipelineStatusChange({ scope: 'freelancer', user_id: data.user_id });
    },
    onError: (err: Error) => {
      toast.error(`Failed to update freelancer status: ${err.message}`);
    },
  });
}
