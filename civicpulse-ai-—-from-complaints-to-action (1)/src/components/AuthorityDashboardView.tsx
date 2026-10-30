import {
  AlertTriangle,
  ArrowUpDown,
  Database,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  ActionBrief,
  AnalyticsSummary,
  Complaint,
  PriorityLevel,
  SUPPORTED_CATEGORIES,
  WORKFLOW_STATUSES,
} from '../shared/types.ts';

interface AuthorityDashboardViewProps {
  complaints: Complaint[];
  analytics: AnalyticsSummary | null;
  actionBrief: ActionBrief | null;
  onSelectComplaint: (publicId: string) => void;
  onNavigateMap: () => void;
  onRefreshAll: () => void;
  onSeedSampleData: () => Promise<void>;
  isSeeding: boolean;
}

export const AuthorityDashboardView: React.FC<AuthorityDashboardViewProps> = ({
  complaints,
  analytics,
  actionBrief,
  onSelectComplaint,
  onNavigateMap,
  onRefreshAll,
  onSeedSampleData,
  isSeeding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [duplicatesOnly, setDuplicatesOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'priority_desc' | 'priority_asc' | 'newest' | 'oldest'>(
    'priority_desc'
  );

  const filteredComplaints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const locQ = locationFilter.trim().toLowerCase();

    const list = complaints.filter((c) => {
      if (q) {
        const match =
          c.public_id.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.location_name.toLowerCase().includes(q) ||
          (c.assigned_team && c.assigned_team.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      if (priorityFilter !== 'All' && c.priority_level !== priorityFilter) return false;
      if (statusFilter !== 'All') {
        if (statusFilter === 'Unresolved') {
          if (c.status === 'Resolved') return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (locQ && !c.location_name.toLowerCase().includes(locQ)) return false;
      if (
        duplicatesOnly &&
        c.duplicate_status !== 'potential' &&
        c.duplicate_status !== 'confirmed'
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'priority_desc') {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return b.created_at.localeCompare(a.created_at);
      }
      if (sortBy === 'priority_asc') {
        if (a.priority_score !== b.priority_score) return a.priority_score - b.priority_score;
        return b.created_at.localeCompare(a.created_at);
      }
      if (sortBy === 'newest') {
        return b.created_at.localeCompare(a.created_at);
      }
      return a.created_at.localeCompare(b.created_at);
    });
  }, [
    complaints,
    searchQuery,
    categoryFilter,
    priorityFilter,
    statusFilter,
    locationFilter,
    duplicatesOnly,
    sortBy,
  ]);

  const totalCount = analytics?.total_complaints ?? complaints.length;
  const unresolvedCount =
    analytics?.unresolved_complaints ??
    complaints.filter((c) => c.status !== 'Resolved').length;
  const criticalCount =
    analytics?.critical_complaints ??
    complaints.filter((c) => c.priority_level === 'Critical').length;
  const resolvedCount =
    analytics?.resolved_complaints ??
    complaints.filter((c) => c.status === 'Resolved').length;
  const duplicateCount =
    analytics?.possible_duplicates ??
    complaints.filter(
      (c) => c.duplicate_status === 'potential' || c.duplicate_status === 'confirmed'
    ).length;

  const maxCatVal = useMemo(() => {
    if (!analytics) return 1;
    const vals = Object.values(analytics.category_distribution);
    return Math.max(1, ...vals);
  }, [analytics]);

  const maxTrendVal = useMemo(() => {
    if (!analytics || analytics.trend_by_day.length === 0) return 1;
    return Math.max(1, ...analytics.trend_by_day.map((d) => d.count));
  }, [analytics]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('All');
    setPriorityFilter('All');
    setStatusFilter('All');
    setLocationFilter('');
    setDuplicatesOnly(false);
    setSortBy('priority_desc');
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700">
            Stage 02 & 03 · Authority Operations & Pattern Intelligence
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Municipal Authority Dashboard
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time complaint triage, explainable priority rankings, duplicate candidate verification, and ward analytics.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {totalCount === 0 && (
            <button
              type="button"
              disabled={isSeeding}
              onClick={onSeedSampleData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isSeeding ? 'Seeding...' : 'Load 45 Synthetic Demo Reports'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNavigateMap}
            className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            View Geographic Hotspots
          </button>
          <button
            type="button"
            onClick={onRefreshAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Synthetic Dataset Disclosure Banner when synthetic records exist */}
      {analytics && analytics.synthetic_count > 0 && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            <strong>Dataset Disclosure:</strong> Database currently contains{' '}
            <span className="font-mono-tabular font-semibold text-slate-900">
              {analytics.synthetic_count}
            </span>{' '}
            synthetic demonstration record(s) and{' '}
            <span className="font-mono-tabular font-semibold text-slate-900">
              {analytics.total_complaints - analytics.synthetic_count}
            </span>{' '}
            live user-submitted report(s). All counts and charts are computed directly from SQLite records.
          </span>
          <span className="font-mono-tabular text-slate-500">
            {analytics.with_coordinates_count} geocoded · {analytics.missing_coordinates_count} without GPS
          </span>
        </div>
      )}

      {/* 5-Column KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Total Complaints</div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900">
            {totalCount}
          </div>
          <div className="text-xs text-slate-500">
            All logged reports in SQLite
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Unresolved Open</div>
          <div className="text-2xl font-bold font-mono-tabular text-amber-700">
            {unresolvedCount}
          </div>
          <div className="text-xs text-slate-500">
            Awaiting action or in progress
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Critical Priority</div>
          <div className="text-2xl font-bold font-mono-tabular text-red-700">
            {criticalCount}
          </div>
          <div className="text-xs text-slate-500">
            Score 3.50–5.00 or safety flag
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Resolved & Verified</div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-700">
            {resolvedCount}
          </div>
          <div className="text-xs text-slate-500">
            Completed workflow lifecycle
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500">Possible Duplicates</div>
          <div className="text-2xl font-bold font-mono-tabular text-teal-700">
            {duplicateCount}
          </div>
          <div className="text-xs text-slate-500">
            {analytics?.confirmed_duplicates ?? 0} confirmed by officer
          </div>
        </div>
      </div>

      {/* Operational Action Brief Card */}
      {actionBrief && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-700 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">
                Operational Action Brief
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500">
              Method: {actionBrief.method} · Updated{' '}
              {new Date(actionBrief.generated_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              {actionBrief.headline}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {actionBrief.narrative}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-slate-900">Key Database Observations:</div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                {actionBrief.key_observations.map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-teal-800">
                Triage Recommendations (Requires Officer Action):
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                {actionBrief.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
            {actionBrief.disclaimer}
          </div>
        </div>
      )}

      {/* Analytics Charts Section (3-Column Grid) */}
      {analytics && analytics.total_complaints > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. Category Distribution */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <h3 className="text-sm font-bold text-slate-900">
              Category Distribution
            </h3>
            <div className="space-y-2.5">
              {SUPPORTED_CATEGORIES.map((cat) => {
                const count = analytics.category_distribution[cat] || 0;
                const pct = Math.round((count / Math.max(1, analytics.total_complaints)) * 100);
                const widthPct = Math.round((count / maxCatVal) * 100);
                return (
                  <div key={cat} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setCategoryFilter(categoryFilter === cat ? 'All' : cat)
                        }
                        className="text-slate-700 hover:text-teal-700 font-medium cursor-pointer"
                      >
                        {cat}
                      </button>
                      <span className="font-mono-tabular text-slate-600">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-600 rounded-full transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Priority Level Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <h3 className="text-sm font-bold text-slate-900">
              Priority Score Distribution
            </h3>
            <div className="space-y-3 pt-1">
              {(
                [
                  {
                    level: 'Critical',
                    range: '3.50 – 5.00',
                    barClass: 'bg-red-600',
                    textClass: 'text-red-700',
                  },
                  {
                    level: 'High',
                    range: '2.50 – 3.49',
                    barClass: 'bg-amber-600',
                    textClass: 'text-amber-700',
                  },
                  {
                    level: 'Medium',
                    range: '1.50 – 2.49',
                    barClass: 'bg-sky-600',
                    textClass: 'text-sky-700',
                  },
                  {
                    level: 'Low',
                    range: '0.00 – 1.49',
                    barClass: 'bg-slate-600',
                    textClass: 'text-slate-700',
                  },
                ] as Array<{
                  level: PriorityLevel;
                  range: string;
                  barClass: string;
                  textClass: string;
                }>
              ).map((item) => {
                const count = analytics.priority_distribution[item.level] || 0;
                const pct = Math.round((count / Math.max(1, analytics.total_complaints)) * 100);
                return (
                  <div key={item.level} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`font-semibold ${item.textClass}`}>
                          {item.level}
                        </span>{' '}
                        <span className="font-mono-tabular text-slate-400">
                          ({item.range})
                        </span>
                      </div>
                      <span className="font-mono-tabular font-medium text-slate-800">
                        {count} reports ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.barClass} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Submission & Resolution Timeline Trend */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Daily Intake & Resolution Trend
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Complaints grouped by submission date (UTC)
              </p>
            </div>

            <div className="flex items-end gap-2 h-40 pt-4 pb-1 border-b border-slate-100">
              {analytics.trend_by_day.map((day) => {
                const heightPct = Math.max(8, Math.round((day.count / maxTrendVal) * 100));
                const shortDate = day.date.slice(5);
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                    title={`${day.date}: ${day.count} submitted, ${day.resolved} resolved`}
                  >
                    <span className="text-[10px] font-mono-tabular text-slate-500">
                      {day.count}
                    </span>
                    <div
                      className="w-full max-w-[24px] bg-teal-600/85 hover:bg-teal-700 rounded-t transition-all"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[10px] font-mono-tabular text-slate-400 truncate max-w-full">
                      {shortDate}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 font-mono-tabular">
              <span>Needs Officer Review: {analytics.needs_review_count}</span>
              <span>Confirmed Duplicates: {analytics.confirmed_duplicates}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, description, summary, or ward..."
              aria-label="Search complaints"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="All">All Categories</option>
              {SUPPORTED_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="All">All Workflow Statuses</option>
              <option value="Unresolved">All Unresolved (Open)</option>
              {WORKFLOW_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Filter location / ward..."
              aria-label="Filter by location"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Second Filter Row: Interactive Segmented Priority Controls + Duplicates Toggle + Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Priority Filter Buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setPriorityFilter(lvl)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    priorityFilter === lvl
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lvl === 'All' ? 'All Priorities' : lvl}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={duplicatesOnly}
                onChange={(e) => setDuplicatesOnly(e.target.checked)}
                className="rounded border-slate-300 text-teal-600"
              />
              <span>Flagged Duplicates Only</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort complaints"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="priority_desc">Sort: Highest Priority First</option>
                <option value="priority_asc">Sort: Lowest Priority First</option>
                <option value="newest">Sort: Newest Submitted First</option>
                <option value="oldest">Sort: Oldest Submitted First</option>
              </select>
            </div>

            {(searchQuery ||
              categoryFilter !== 'All' ||
              priorityFilter !== 'All' ||
              statusFilter !== 'All' ||
              locationFilter ||
              duplicatesOnly) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-teal-700 hover:text-teal-900 underline cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Complaints Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Complaint Operations Queue ({filteredComplaints.length} matching records)
          </h2>
          <span className="text-xs text-slate-500">
            Click any row or ID to inspect AI breakdown and execute workflow actions
          </span>
        </div>

        {filteredComplaints.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <AlertTriangle className="w-6 h-6 text-slate-400 mx-auto" />
            <div className="text-sm font-semibold text-slate-900">
              No Complaints Match Current Filters
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try clearing your active search or category filters, or submit a new citizen report.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Tracking ID</th>
                  <th className="py-3 px-4">Category & Summary</th>
                  <th className="py-3 px-4">Location / Ward</th>
                  <th className="py-3 px-4 text-right">Priority Score</th>
                  <th className="py-3 px-4">Status & Team</th>
                  <th className="py-3 px-4 text-right">Submitted</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredComplaints.map((c) => {
                  const priorityTextColor =
                    c.priority_level === 'Critical'
                      ? 'text-red-700 font-bold'
                      : c.priority_level === 'High'
                      ? 'text-amber-700 font-semibold'
                      : c.priority_level === 'Medium'
                      ? 'text-sky-700 font-medium'
                      : 'text-slate-600';

                  return (
                    <tr
                      key={c.public_id}
                      onClick={() => onSelectComplaint(c.public_id)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono-tabular whitespace-nowrap align-top">
                        <div className="font-bold text-teal-700">{c.public_id}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {c.duplicate_status === 'confirmed'
                            ? `Dup of ${c.duplicate_of_public_id || '#'}`
                            : c.duplicate_status === 'potential'
                            ? 'Possible Duplicate'
                            : c.needs_review
                            ? 'Needs Review'
                            : 'Verified'}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-md align-top">
                        <div className="flex items-center gap-1.5 text-slate-900 font-semibold">
                          <span>{c.category}</span>
                          {c.safety_override && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="text-red-700 font-medium">
                                Safety Escalation
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-slate-600 line-clamp-2 mt-0.5">{c.summary}</div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-800">{c.location_name}</div>
                        <div className="font-mono-tabular text-[11px] text-slate-400 mt-0.5">
                          {c.latitude !== null && c.longitude !== null
                            ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`
                            : 'No GPS coords'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap align-top">
                        <div className={priorityTextColor}>
                          {c.priority_score.toFixed(2)} / 5.00
                        </div>
                        <div className={`text-[11px] ${priorityTextColor}`}>
                          {c.priority_level}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-semibold text-slate-900">{c.status}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px] mt-0.5">
                          {c.assigned_team || 'Unassigned'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-500 whitespace-nowrap align-top">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectComplaint(c.public_id);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
