import {
  ArrowRight,
  Compass,
  GitMerge,
  Layers,
  MapPin,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import React from 'react';
import { AnalyticsSummary, HotspotCluster } from '../shared/types.ts';

interface LandingViewProps {
  analytics: AnalyticsSummary | null;
  hotspots: HotspotCluster[];
  onNavigateReport: () => void;
  onNavigateTrack: () => void;
  onNavigateDashboard: () => void;
  onNavigateMap: () => void;
  onSelectComplaint: (publicId: string) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  analytics,
  hotspots,
  onNavigateReport,
  onNavigateTrack,
  onNavigateDashboard,
  onNavigateMap,
  onSelectComplaint,
}) => {
  const total = analytics?.total_complaints ?? 0;
  const unresolved = analytics?.unresolved_complaints ?? 0;
  const critical = analytics?.critical_complaints ?? 0;
  const duplicates = analytics?.possible_duplicates ?? 0;
  const syntheticCount = analytics?.synthetic_count ?? 0;

  return (
    <div className="space-y-16 py-10 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6 bg-white border border-slate-200 rounded-2xl p-8 sm:p-10">
          <div className="space-y-4">
            <div className="text-xs font-semibold text-teal-700">
              AI for Civic Impact · Municipal Operations Platform
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-[1.12]">
              CivicPulse AI — From Complaints to Action
            </h1>
            <p className="text-lg font-medium text-slate-800">
              Report Problems. Discover Patterns. Prioritize Action.
            </p>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              Citizens report damaged roads, waterlogging, overflowing waste, blocked drainage, broken streetlights, and safety hazards. CivicPulse AI transforms unstructured citizen reports into categorized, deduplicated, geographically clustered, and explainably prioritized municipal action.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNavigateReport}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Report an Issue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNavigateTrack}
              className="px-5 py-3 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Track My Complaint
            </button>
            <button
              type="button"
              onClick={onNavigateDashboard}
              className="px-5 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Authority Dashboard
            </button>
          </div>
        </div>

        {/* Right Column: Live / Demonstration Operational Snapshot */}
        <div className="lg:col-span-5 bg-slate-900 text-slate-100 rounded-2xl p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>SQLite Database Snapshot</span>
              <span className="font-mono-tabular">
                {syntheticCount > 0
                  ? `Includes ${syntheticCount} Synthetic Demo Records`
                  : 'Live Database Records'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-wide">
              Real-Time Municipal Triage Status
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Metrics below are computed directly from the active SQLite database. Synthetic demonstration records are explicitly labeled and never presented as live municipal statistics.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 py-2 border-y border-slate-800">
            <div>
              <div className="text-xs text-slate-400">Total Reports Logged</div>
              <div className="text-2xl font-bold font-mono-tabular text-white mt-0.5">
                {total}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Unresolved Queue</div>
              <div className="text-2xl font-bold font-mono-tabular text-amber-400 mt-0.5">
                {unresolved}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Critical Priority</div>
              <div className="text-2xl font-bold font-mono-tabular text-red-400 mt-0.5">
                {critical}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Detected Hotspots</div>
              <div className="text-2xl font-bold font-mono-tabular text-teal-400 mt-0.5">
                {hotspots.length}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="text-slate-300 font-medium">
              Active Geographic Clusters & Flagged Duplicates ({duplicates} pairs):
            </div>
            {hotspots.length > 0 ? (
              <div className="space-y-1.5 text-slate-300">
                {hotspots.slice(0, 2).map((hs) => (
                  <div key={hs.cluster_id} className="flex items-center justify-between">
                    <span>
                      <strong className="text-white font-mono-tabular">{hs.cluster_id}</strong> ·{' '}
                      {hs.primary_area}
                    </span>
                    <span className="font-mono-tabular text-teal-300">
                      {hs.report_count} reports (Avg {hs.avg_priority_score.toFixed(2)})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400">No spatial clusters currently active.</div>
            )}
            <div className="pt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={onNavigateMap}
                className="text-teal-300 hover:text-teal-200 font-medium underline cursor-pointer"
              >
                Explore Geographic Hotspot Map
              </button>
              <button
                type="button"
                onClick={() => onSelectComplaint('CP-2026-S007')}
                className="text-slate-300 hover:text-white underline cursor-pointer"
              >
                Inspect Sample Critical Report
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How the 4-Stage Pipeline Works */}
      <section className="space-y-6">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-2xl font-bold text-slate-900">
            How CivicPulse AI Transforms Reports into Action
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            A four-stage architecture designed for transparent, explainable civic operations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="text-xs font-mono-tabular font-semibold text-teal-700">
              01. Capture
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Structured & Anonymous Intake
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Citizens submit descriptions, categories, ward names, interactive map coordinates, and optional photo evidence without exposing personal identity.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="text-xs font-mono-tabular font-semibold text-teal-700">
              02. Understand
            </div>
            <h3 className="text-base font-bold text-slate-900">
              AI Triage & Explainable Scoring
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Categorizes reports, extracts concise officer summaries, flags probable duplicates with similarity evidence, and calculates transparent weighted priority scores.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="text-xs font-mono-tabular font-semibold text-teal-700">
              03. Reveal
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Spatial DBSCAN Hotspot Discovery
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Groups nearby geocoded complaints into geographic hotspots, highlights multi-category infrastructure failures, and synthesizes live operational action briefs.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="text-xs font-mono-tabular font-semibold text-teal-700">
              04. Act
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Protected Dispatch & Public Tracking
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Authorized officers assign specialized teams, confirm or reject duplicate candidates, and update lifecycle statuses that sync immediately to the citizen tracking portal.
            </p>
          </div>
        </div>
      </section>

      {/* Core Platform Capabilities */}
      <section className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Key Platform Capabilities & Safeguards
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Engineered with deterministic fallbacks, explicit uncertainty indicators, and strict auditability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Sliders className="w-4 h-4 text-teal-700" />
              <span>Transparent Weighted Priority Formula</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Computes <span className="font-mono-tabular">0.35×Urgency + 0.35×Safety + 0.20×Affected + 0.10×Recurrence</span> on a 0–5 scale, disclosing every text-inferred assumption, missing coordinate notice, and life-safety hazard escalation rule.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <GitMerge className="w-4 h-4 text-teal-700" />
              <span>Non-Destructive Duplicate Detection</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Combines lexical stem similarity, Haversine distance, and category compatibility while guarding against false positives across distant wards. Never deletes citizen reports; officers confirm or reject links.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Layers className="w-4 h-4 text-teal-700" />
              <span>DBSCAN Geographic Hotspot Engine</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Identifies multi-report spatial clusters from real coordinates without crashing on unmapped reports, and explicitly distinguishes area-wide infrastructure hotspots from single duplicate incidents.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Compass className="w-4 h-4 text-teal-700" />
              <span>Hybrid AI + Deterministic Fallback</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Supports Gemini 3.8 Flash for classification, summarization, and operational briefs, while automatically falling back to deterministic lexical rules and extractive templates when offline.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <span>Protected Administrative Workflow</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Enforces valid lifecycle transitions (<span className="font-mono-tabular">Submitted → Under Review → Assigned → In Progress → Resolved</span>), scrypt password hashing, session validation, and CSRF tokens.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <MapPin className="w-4 h-4 text-teal-700" />
              <span>Real-Time Multi-User Synchronization</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              WebSocket event broadcasting ensures that new citizen submissions, team assignments, and status updates appear live across all connected authority dashboards and citizen tracking screens.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
