import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  GitMerge,
  Lock,
  MapPin,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  Complaint,
  ComplaintCategory,
  ComplaintStatus,
  MUNICIPAL_TEAMS,
  SUPPORTED_CATEGORIES,
} from '../shared/types.ts';
import { LocationPinPickerMap } from './LeafletMapView.tsx';

interface ComplaintDetailViewProps {
  publicId: string;
  adminAuth: {
    authenticated: boolean;
    username: string | null;
    csrfToken: string | null;
    sessionToken: string | null;
  };
  onAdminLoginRequest: () => void;
  onBack: () => void;
  onSelectComplaint: (publicId: string) => void;
  onNavigateTrack: (publicId: string) => void;
  liveUpdateTick: number;
}

const VALID_TRANSITIONS_MAP: Record<ComplaintStatus, ComplaintStatus[]> = {
  Submitted: ['Under Review', 'Assigned', 'In Progress'],
  'Under Review': ['Assigned', 'In Progress', 'Resolved'],
  Assigned: ['In Progress', 'Under Review', 'Resolved'],
  'In Progress': ['Resolved', 'Assigned', 'Under Review'],
  Resolved: ['Reopened'],
  Reopened: ['Under Review', 'Assigned', 'In Progress', 'Resolved'],
};

export const ComplaintDetailView: React.FC<ComplaintDetailViewProps> = ({
  publicId,
  adminAuth,
  onAdminLoginRequest,
  onBack,
  onSelectComplaint,
  onNavigateTrack,
  liveUpdateTick,
}) => {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTeam, setSelectedTeam] = useState<string>(MUNICIPAL_TEAMS[0]);
  const [assignMessage, setAssignMessage] = useState('');
  const [nextStatus, setNextStatus] = useState<ComplaintStatus>('Under Review');
  const [statusMessage, setStatusMessage] = useState('');
  const [overrideCategory, setOverrideCategory] = useState<ComplaintCategory>('Road Damage');
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadDetail = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/complaints/${encodeURIComponent(publicId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Complaint "${publicId}" not found.`);
      }
      const c: Complaint = data.complaint;
      setComplaint(c);
      if (c.assigned_team) {
        setSelectedTeam(c.assigned_team);
      }
      setOverrideCategory(c.category);
      const allowed = VALID_TRANSITIONS_MAP[c.status] || [];
      if (allowed.length > 0) {
        setNextStatus(allowed[0]);
      }
    } catch (err: any) {
      if (!silent) {
        setError(err?.message || 'Unable to load complaint detail.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadDetail();
  }, [publicId]);

  useEffect(() => {
    if (liveUpdateTick > 0) {
      loadDetail(true);
    }
  }, [liveUpdateTick]);

  const buildAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (adminAuth.csrfToken) {
      headers['x-csrf-token'] = adminAuth.csrfToken;
    }
    if (adminAuth.sessionToken) {
      headers['Authorization'] = `Bearer ${adminAuth.sessionToken}`;
    }
    return headers;
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint || submittingAction) return;
    setActionFeedback(null);
    setSubmittingAction(true);

    try {
      const res = await fetch(`/api/admin/complaints/${complaint.id}/assign`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          assigned_team: selectedTeam,
          public_message: assignMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign team.');
      }
      setComplaint(data.complaint);
      setAssignMessage('');
      const allowed = VALID_TRANSITIONS_MAP[data.complaint.status as ComplaintStatus] || [];
      if (allowed.length > 0) setNextStatus(allowed[0]);
      setActionFeedback({
        type: 'success',
        text: data.message || `Assigned to ${selectedTeam}.`,
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Failed to assign team.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint || submittingAction) return;
    setActionFeedback(null);
    setSubmittingAction(true);

    try {
      const res = await fetch(`/api/admin/complaints/${complaint.id}/status`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          status: nextStatus,
          category: overrideCategory,
          public_message: statusMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status.');
      }
      setComplaint(data.complaint);
      setStatusMessage('');
      const allowed = VALID_TRANSITIONS_MAP[data.complaint.status as ComplaintStatus] || [];
      if (allowed.length > 0) setNextStatus(allowed[0]);
      setActionFeedback({
        type: 'success',
        text: data.message || `Status updated to ${nextStatus}.`,
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Failed to update status.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDuplicateDecision = async (
    action: 'confirm' | 'reject',
    targetId?: number
  ) => {
    if (!complaint || submittingAction) return;
    setActionFeedback(null);
    setSubmittingAction(true);

    try {
      const res = await fetch(`/api/admin/complaints/${complaint.id}/duplicate`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          action,
          duplicate_of_id: targetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update duplicate relationship.');
      }
      setComplaint(data.complaint);
      setActionFeedback({
        type: 'success',
        text:
          action === 'confirm'
            ? 'Confirmed duplicate relationship for consolidated dispatch.'
            : 'Rejected duplicate flag; marked as independent civic incident.',
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Duplicate review action failed.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-white border border-slate-200 rounded-xl p-6" />
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Authority Dashboard</span>
        </button>
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
          <AlertTriangle className="w-6 h-6 text-red-600 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Complaint Not Found</h2>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  const pb = complaint.priority_breakdown;
  const allowedNextStatuses = VALID_TRANSITIONS_MAP[complaint.status] || [];

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Operations Queue</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigateTrack(complaint.public_id)}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            Open Citizen Tracking View
          </button>
        </div>
      </div>

      {/* Primary Header Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono-tabular">
              <span className="font-bold text-slate-900 text-sm">{complaint.public_id}</span>
              <span aria-hidden="true">·</span>
              <span>Logged {new Date(complaint.created_at).toLocaleString()}</span>
              <span aria-hidden="true">·</span>
              <span>Status: <strong className="text-slate-900">{complaint.status}</strong></span>
              {complaint.is_synthetic && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-sans">Synthetic Dataset Record</span>
                </>
              )}
              {complaint.needs_review && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-800 font-semibold font-sans">Needs Officer Review</span>
                </>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {complaint.category} — {complaint.location_name}
            </h1>
          </div>

          <div className="flex items-center gap-6 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Priority Score</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900">
                {complaint.priority_score.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-500">/ 5.00</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Priority Level</div>
              <div
                className={`text-base font-bold ${
                  complaint.priority_level === 'Critical'
                    ? 'text-red-700'
                    : complaint.priority_level === 'High'
                    ? 'text-amber-700'
                    : complaint.priority_level === 'Medium'
                    ? 'text-sky-700'
                    : 'text-slate-700'
                }`}
              >
                {complaint.priority_level}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Assigned Team</div>
              <div className="text-sm font-semibold text-slate-900">
                {complaint.assigned_team || 'Unassigned'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Description, AI Triage, Priority Breakdown, Duplicate Candidates */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Original Report & Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Citizen Report & AI Triage Summary
            </h2>

            <div className="space-y-1">
              <div className="text-xs text-slate-500">
                Officer Summary ({complaint.summary_method})
              </div>
              <p className="text-sm font-medium text-slate-900">{complaint.summary}</p>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1">
              <div className="text-xs text-slate-500">Original Unedited Citizen Description</div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {complaint.description}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Citizen Selected Category</span>
                <span className="font-semibold text-slate-800">
                  {complaint.citizen_category || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Predicted Category</span>
                <span className="font-semibold text-slate-800">
                  {complaint.predicted_category} ({Math.round(complaint.category_confidence * 100)}%)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Classification Method</span>
                <span className="font-mono-tabular text-slate-700">
                  {complaint.category_method}
                </span>
              </div>
            </div>

            {complaint.image_filename && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs text-slate-500">Attached Citizen Evidence Photo</div>
                <img
                  src={complaint.image_filename}
                  alt={`Field evidence for ${complaint.public_id}`}
                  referrerPolicy="no-referrer"
                  className="max-h-64 rounded-lg border border-slate-200 object-contain"
                />
              </div>
            )}
          </div>

          {/* 2. Explainable Priority Engine Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Explainable Priority Score Breakdown
              </h2>
              <span className="text-xs font-mono-tabular text-slate-500">
                Formula: 0.35×U + 0.35×S + 0.20×P + 0.10×R
              </span>
            </div>

            {pb.safety_override && pb.safety_override_reason && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Life-Safety Escalation Rule Triggered</div>
                  <div className="mt-0.5">{pb.safety_override_reason}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              {[
                { label: 'Urgency (35%)', val: pb.factors.urgency },
                { label: 'Safety Impact (35%)', val: pb.factors.safety_impact },
                { label: 'People Affected (20%)', val: pb.factors.people_affected },
                { label: 'Recurrence (10%)', val: pb.factors.recurrence },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{f.label}</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {f.val.toFixed(1)}/5
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full"
                      style={{ width: `${Math.min(100, (f.val / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Scoring Calculation:</span>
                <span className="font-mono-tabular text-slate-800">{pb.formula_display}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Recommended Operational Action:</span>
                <span className="text-slate-900 font-medium">{complaint.recommended_action}</span>
              </div>
            </div>

            {pb.assumptions && pb.assumptions.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-1 text-xs">
                <div className="font-medium text-slate-700">
                  Explicit Factor Assumptions & Estimates:
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  {pb.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {pb.missing_info && pb.missing_info.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-1 text-xs">
                <div className="font-medium text-amber-800">
                  Missing or Uncertain Information:
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  {pb.missing_info.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 3. Duplicate Candidates & Verification */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">
                  Duplicate Detection & Candidate Verification
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Status: <strong className="text-slate-800">{complaint.duplicate_status}</strong>
              </span>
            </div>

            {complaint.duplicate_status === 'confirmed' && complaint.duplicate_of_public_id && (
              <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-3">
                <div>
                  Confirmed as a duplicate of{' '}
                  <button
                    type="button"
                    onClick={() => onSelectComplaint(complaint.duplicate_of_public_id!)}
                    className="font-mono-tabular font-bold underline cursor-pointer"
                  >
                    {complaint.duplicate_of_public_id}
                  </button>
                  . Both reports remain preserved and independently traceable.
                </div>
                {adminAuth.authenticated && (
                  <button
                    type="button"
                    onClick={() => handleDuplicateDecision('reject')}
                    className="px-2.5 py-1 text-xs font-medium bg-white border border-teal-300 rounded hover:bg-teal-100 cursor-pointer shrink-0"
                  >
                    Unlink
                  </button>
                )}
              </div>
            )}

            {complaint.duplicate_candidates.length === 0 ? (
              <p className="text-xs text-slate-500">
                No probable duplicate candidates detected within proximity and lexical thresholds.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Reports are never merged or deleted automatically. Officers may confirm or reject candidate links below:
                </p>
                {complaint.duplicate_candidates.map((cand) => (
                  <div
                    key={cand.candidate_public_id}
                    className="p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono-tabular">
                        <button
                          type="button"
                          onClick={() => onSelectComplaint(cand.candidate_public_id)}
                          className="font-bold text-teal-700 hover:underline cursor-pointer"
                        >
                          {cand.candidate_public_id}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">
                          {Math.round(cand.similarity_score * 100)}% Match
                        </span>
                        {cand.distance_meters !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-600">{cand.distance_meters}m away</span>
                          </>
                        )}
                      </div>
                      <span className="text-slate-500">Status: {cand.status}</span>
                    </div>
                    <p className="text-slate-800 font-medium">{cand.summary}</p>
                    <p className="text-slate-500">{cand.reason}</p>

                    {adminAuth.authenticated && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={() => handleDuplicateDecision('confirm', cand.candidate_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Confirm Duplicate</span>
                        </button>
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={() => handleDuplicateDecision('reject')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Reject Flag</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Administrative Action Console, Location Map, Status History, Related */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Administrative Action Console */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">
                  Authority Action Console
                </h2>
              </div>
              {adminAuth.authenticated ? (
                <span className="text-xs text-emerald-700 font-medium">
                  Officer: {adminAuth.username}
                </span>
              ) : (
                <span className="text-xs text-amber-700 font-medium">Read-Only Mode</span>
              )}
            </div>

            {actionFeedback && (
              <div
                className={`p-3 rounded-lg text-xs border ${
                  actionFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {actionFeedback.text}
              </div>
            )}

            {!adminAuth.authenticated ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <span>
                    Administrative authentication and CSRF verification are required to assign teams, transition complaint statuses, or confirm duplicate relationships.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onAdminLoginRequest}
                  className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Sign In as Municipal Officer
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Team Assignment Form */}
                <form onSubmit={handleAssignSubmit} className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-900">
                    1. Assign / Reassign Municipal Team
                  </label>
                  <select
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {MUNICIPAL_TEAMS.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={assignMessage}
                    onChange={(e) => setAssignMessage(e.target.value)}
                    placeholder="Optional dispatch note visible on public tracker..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={submittingAction}
                    className="w-full py-2 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Assign Team
                  </button>
                </form>

                {/* Status Transition Form */}
                <form
                  onSubmit={handleStatusUpdate}
                  className="space-y-3 pt-4 border-t border-slate-100"
                >
                  <label className="block text-xs font-semibold text-slate-900">
                    2. Update Workflow Status & Category Review
                  </label>
                  <div className="text-xs text-slate-500">
                    Current Status: <strong className="text-slate-900">{complaint.status}</strong>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <span className="block text-xs text-slate-500 mb-1">Next Allowed Status</span>
                      <select
                        value={nextStatus}
                        onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      >
                        {allowedNextStatuses.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500 mb-1">Verified Category</span>
                      <select
                        value={overrideCategory}
                        onChange={(e) => setOverrideCategory(e.target.value as ComplaintCategory)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      >
                        {SUPPORTED_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={statusMessage}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    placeholder="Public status update message for citizen tracking..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />

                  <button
                    type="submit"
                    disabled={submittingAction}
                    className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Save Status Transition
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* 2. Geographic Coordinates & Mini Map */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Location & Geographic Coordinates
            </h2>
            <div className="text-xs text-slate-700">
              <div className="font-medium text-slate-900">{complaint.location_name}</div>
              {complaint.latitude !== null && complaint.longitude !== null ? (
                <div className="font-mono-tabular text-slate-500 mt-0.5">
                  Latitude: {complaint.latitude.toFixed(6)} · Longitude: {complaint.longitude.toFixed(6)}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-800 mt-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>No GPS coordinates provided with this report.</span>
                </div>
              )}
            </div>

            {complaint.latitude !== null && complaint.longitude !== null && (
              <LocationPinPickerMap
                latitude={complaint.latitude}
                longitude={complaint.longitude}
                onSelectCoordinates={() => {}}
              />
            )}
          </div>

          {/* 3. Status History Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Audit & Status History ({complaint.history?.length || 0})
            </h2>
            <div className="space-y-3.5">
              {(complaint.history || []).map((h, i) => (
                <div
                  key={h.id || i}
                  className="text-xs pb-3 border-b border-slate-100 last:border-b-0 last:pb-0 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {h.previous_status ? `${h.previous_status} → ${h.new_status}` : h.new_status}
                    </span>
                    <span className="font-mono-tabular text-slate-500">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-700">{h.public_message}</p>
                  <div className="text-slate-500">Actor: {h.actor}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Related Complaints */}
          {complaint.related_complaints && complaint.related_complaints.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Related Complaints in Ward / Category
              </h2>
              <div className="space-y-2.5">
                {complaint.related_complaints.map((rel) => (
                  <div
                    key={rel.public_id}
                    className="text-xs pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono-tabular">
                      <button
                        type="button"
                        onClick={() => onSelectComplaint(rel.public_id)}
                        className="font-semibold text-teal-700 hover:underline cursor-pointer"
                      >
                        {rel.public_id}
                      </button>
                      <span className="text-slate-500">
                        {rel.priority_level} · {rel.status}
                      </span>
                    </div>
                    <div className="text-slate-800 truncate mt-0.5">{rel.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
