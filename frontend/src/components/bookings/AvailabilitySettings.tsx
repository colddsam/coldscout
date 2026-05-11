import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Globe, Save, Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  updateMyFreelancerProfile, 
  type FreelancerProfile,
  type SchedulingPrefs,
  type WorkingPeriod 
} from '../../lib/api';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';

// ... (DAYS and COMMON_TIMEZONES remain the same)

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Common timezones - in a real app, this should be a larger list or searchable
const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland'
];


export default function AvailabilitySettings({ profile }: { profile: FreelancerProfile }) {
  const queryClient = useQueryClient();
  
  // Initialize state from profile or defaults
  const [timezone, setTimezone] = useState<string>(
    profile.scheduling_preferences?.timezone || 'UTC'
  );
  
  const [workingHours, setWorkingHours] = useState<Record<string, WorkingPeriod[]>>(
    profile.scheduling_preferences?.working_hours || {
      Monday: [{ start: '09:00', end: '17:00' }],
      Tuesday: [{ start: '09:00', end: '17:00' }],
      Wednesday: [{ start: '09:00', end: '17:00' }],
      Thursday: [{ start: '09:00', end: '17:00' }],
      Friday: [{ start: '09:00', end: '17:00' }],
    }
  );

  const mutation = useMutation({
    mutationFn: (newPrefs: SchedulingPrefs) => 
      updateMyFreelancerProfile({ scheduling_preferences: newPrefs }),
    onSuccess: () => {
      toast.success('Availability settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save settings'),
  });

  const handleToggleDay = (day: string) => {
    setWorkingHours(prev => {
      const next = { ...prev };
      if (next[day]) {
        delete next[day];
      } else {
        next[day] = [{ start: '09:00', end: '17:00' }];
      }
      return next;
    });
  };

  const handleAddTimeRange = (day: string) => {
    setWorkingHours(prev => {
      const next = { ...prev };
      const dayPeriods = [...(next[day] || [])];
      // Default new range to follow the last one or 9-5
      const lastEnd = dayPeriods.length > 0 ? dayPeriods[dayPeriods.length - 1].end : '17:00';
      dayPeriods.push({ start: lastEnd, end: '18:00' });
      next[day] = dayPeriods;
      return next;
    });
  };

  const handleRemoveTimeRange = (day: string, index: number) => {
    setWorkingHours(prev => {
      const next = { ...prev };
      const dayPeriods = [...(next[day] || [])];
      dayPeriods.splice(index, 1);
      if (dayPeriods.length === 0) {
        delete next[day];
      } else {
        next[day] = dayPeriods;
      }
      return next;
    });
  };

  const handleUpdateRange = (day: string, index: number, field: 'start' | 'end', value: string) => {
    setWorkingHours(prev => {
      const next = { ...prev };
      const dayPeriods = [...(next[day] || [])];
      dayPeriods[index] = { ...dayPeriods[index], [field]: value };
      next[day] = dayPeriods;
      return next;
    });
  };

  const handleApplyToAll = (sourceDay: string) => {
    const sourcePeriods = workingHours[sourceDay];
    if (!sourcePeriods) return;
    
    setWorkingHours(prev => {
      const next = { ...prev };
      DAYS.forEach(day => {
        next[day] = [...sourcePeriods.map(p => ({ ...p }))];
      });
      return next;
    });
    toast.success(`Copied ${sourceDay}'s hours to all days`);
  };

  const handleSave = () => {
    mutation.mutate({
      working_hours: workingHours,
      timezone
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-info/[0.10] border border-info/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-info" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Timezone Settings</h3>
            <p className="text-sm text-gray-400">All your booking slots will be calculated based on this timezone.</p>
          </div>
        </div>

        <div className="max-w-md">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-400">Primary Timezone</label>
            <button 
              type="button"
              onClick={() => {
                const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (detected) {
                  setTimezone(detected);
                  toast.success(`Detected: ${detected}`);
                }
              }}
              className="text-xs text-info hover:text-info/80 font-medium transition-colors"
            >
              Detect My Timezone
            </button>
          </div>
          <div className="relative">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors appearance-none"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
              {!COMMON_TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <Clock className="w-4 h-4 text-gray-500" />
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Changing your timezone will immediately shift your available slots for leads in different regions.
          </p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-white/80" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Working Hours</h3>
            <p className="text-sm text-gray-400">Define the windows when you are available for meetings.</p>
          </div>
        </div>

        <div className="space-y-4">
          {DAYS.map(day => {
            const isActive = !!workingHours[day];
            return (
              <div key={day} className="flex flex-col md:flex-row md:items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3 min-w-[140px] pt-1">
                  <Toggle 
                    value={isActive} 
                    onChange={() => handleToggleDay(day)}
                    labelOn="ON"
                    labelOff="OFF"
                    colorOn="bg-success"
                  />
                  <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-500'}`}>
                    {day}
                  </span>
                </div>

                <div className="flex-1 space-y-3">
                  {!isActive ? (
                    <span className="text-sm text-gray-600 italic">Unavailable</span>
                  ) : (
                    <>
                      {workingHours[day].map((period, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <input 
                            type="time" 
                            value={period.start}
                            onChange={(e) => handleUpdateRange(day, idx, 'start', e.target.value)}
                            className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                          />
                          <span className="text-gray-500">to</span>
                          <input 
                            type="time" 
                            value={period.end}
                            onChange={(e) => handleUpdateRange(day, idx, 'end', e.target.value)}
                            className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                          />
                          <button 
                            onClick={() => handleRemoveTimeRange(day, idx)}
                            className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-4">
                        <button 
                          onClick={() => handleAddTimeRange(day)}
                          className="text-xs text-info hover:text-info/80 font-medium flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Range
                        </button>
                        <button 
                          onClick={() => handleApplyToAll(day)}
                          className="text-xs text-white/70 hover:text-white font-medium flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3" /> Apply to all days
                        </button>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">(24h format)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button 
          onClick={handleSave} 
          loading={mutation.isPending}
          className="flex items-center gap-2 px-8"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Availability
        </Button>
      </div>
    </div>
  );
}
