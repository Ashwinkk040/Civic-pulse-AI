import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ComplaintStatus, StatusHistoryEntry } from '../shared/types.ts';

interface PublicTrackingData {
  public_id: string;
  category: string;
  location_name: string;
  summary: string;
  priority_level: string;
  priority_score: number;
  priority_reason: string;
  status: ComplaintStatus;
  assigned_team: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  is_synthetic: boolean;
  history: StatusHistoryEntry[];
}

interface CitizenTrackingViewProps {
  initialPublicId?: string | null;
  sampleIds: string[];
  liveUpdateTick: number;
}

const LIFECYCLE_STEPS: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
];

export const CitizenTrackingView: React.FC<CitizenTrackingViewProps> = ({
  initialPublicId,
  sampleIds,
  liveUpdateTick,
}) => {
  const [queryId, setQueryId] = useState(initialPublicId || '');
  const [activeId, setActiveId] = useState<string | null>(initialPublicId || null);
  const [trackingData, setTrackingData] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async (idToFetch: string, silent = false) => {
    const trimmed = idToFetch.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter a valid complaint tracking ID (e.g., CP-2026-S001).');
      return;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await fetch(`/api/track/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Complaint "${trimmed}" not found.`);
      }
      setTrackingData(data);
      setActiveId(trimmed);
      setError(null);
    } catch (err: any) {
      if (!silent) {
        setTrackingData(null);
        setError(err?.message || 'Unable to retrieve tracking record.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (initialPublicId) {
      setQueryId(initialPublicId);
      fetchTracking(initialPublicId);
    }
  }, [initialPublicId]);

  // Real-time refresh when WebSocket broadcasts a status update
  useEffect(() => {
    if (activeId && liveUpdateTick > 0) {
      fetchTracking(activeId, true);
    }
  }, [liveUpdateTick]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(queryId);
  };

  const getStepIndex = (status: ComplaintStatus): number => {
    if (status === 'Reopened') return 1;
    const idx = LIFECYCLE_STEPS.indexOf(status);
    return idx >= 0 ? idx : 0;
  };

  const currentStepIdx = trackingData ? getStepIndex(trackingData.status) : 0;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <p className="text-xs font-medium text-teal-700">Stage 04 · Public Accountability & Resolution</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
          Track My Complaint
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Enter your public tracking ID to view real-time municipal triage status, assigned department, and chronological updates.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              placeholder="Enter Tracking ID (e.g., CP-2026-S001)"
              aria-label="Complaint Tracking ID"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm font-mono-tabular text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {loading ? 'Looking up...' : 'Check Status'}
          </button>
        </div>

        {sampleIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Try recent or demonstration IDs:</span>
            {sampleIds.slice(0, 6).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setQueryId(id);
                  fetchTracking(id);
                }}
                className="font-mono-tabular text-teal-700 hover:text-teal-900 underline cursor-pointer"
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </form>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!trackingData && !error && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
          <Clock className="w-6 h-6 text-slate-400 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900">
            Enter a Complaint ID Above
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Every submitted complaint receives a unique public identifier (such as CP-2026-S001). Public tracking never exposes private citizen contact details or internal administrative credentials.
          </p>
        </div>
      )}

      {trackingData && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono-tabular">
                <span className="font-semibold text-slate-900 text-sm">
                  {trackingData.public_id}
                </span>
                <span aria-hidden="true">·</span>
                <span>Submitted {new Date(trackingData.created_at).toLocaleString()}</span>
                {trackingData.is_synthetic && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700">Synthetic Demo Record</span>
                  </>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {trackingData.category} — {trackingData.location_name}
              </h2>
              <p className="text-sm text-slate-600">{trackingData.summary}</p>
            </div>

            <button
              type="button"
              onClick={() => fetchTracking(trackingData.public_id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0 self-start"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {/* Workflow Progress Stepper */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Current Lifecycle Stage</span>
              <span className="font-semibold text-slate-900">
                {trackingData.status}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {LIFECYCLE_STEPS.map((step, index) => {
                const isCompleted = index <= currentStepIdx;
                const isCurrent = step === trackingData.status;
                return (
                  <div key={step} className="space-y-1.5">
                    <div
                      className={`h-2 rounded-full transition-colors ${
                        isCompleted ? 'bg-teal-600' : 'bg-slate-200'
                      }`}
                    />
                    <div
                      className={`text-xs truncate ${
                        isCurrent
                          ? 'font-bold text-slate-900'
                          : isCompleted
                          ? 'font-medium text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Public Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-sm">
            <div>
              <div className="text-xs text-slate-500">Priority Level</div>
              <div className="font-semibold text-slate-900 mt-0.5 font-mono-tabular">
                {trackingData.priority_level} ({trackingData.priority_score.toFixed(2)} / 5.00)
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Assigned Department / Team</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {trackingData.assigned_team || 'Pending Team Assignment'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Last Updated</div>
              <div className="font-medium text-slate-800 mt-0.5 font-mono-tabular text-xs">
                {new Date(trackingData.updated_at).toLocaleString()}
              </div>
            </div>
          </div>

          {trackingData.status === 'Resolved' && trackingData.resolved_at && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">
                  Resolved on {new Date(trackingData.resolved_at).toLocaleString()}
                </div>
                <div className="mt-0.5">
                  Verified and closed by {trackingData.assigned_team || 'Municipal Field Operations'}.
                </div>
              </div>
            </div>
          )}

          {/* Chronological Status History Timeline */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Chronological Status Timeline
            </h3>
            <div className="space-y-4">
              {trackingData.history.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="flex items-start gap-3.5 text-xs pb-3 border-b border-slate-100 last:border-b-0 last:pb-0"
                >
                  <div className="w-2 h-2 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {entry.previous_status
                          ? `${entry.previous_status} → ${entry.new_status}`
                          : entry.new_status}
                      </span>
                      <span className="font-mono-tabular text-slate-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-700">{entry.public_message}</p>
                    <div className="text-slate-500">Recorded by: {entry.actor}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
            <span>
              Public Transparency View: Personal citizen identifiers and internal administrative credentials are excluded by design.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
