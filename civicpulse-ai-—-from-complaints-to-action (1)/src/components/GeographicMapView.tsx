import {
  AlertCircle,
  Filter,
  Layers,
  List,
  Map as MapIcon,
  MapPinOff,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  Complaint,
  HotspotCluster,
  PriorityLevel,
  SUPPORTED_CATEGORIES,
} from '../shared/types.ts';
import { OperationsLeafletMap } from './LeafletMapView.tsx';

interface GeographicMapViewProps {
  complaints: Complaint[];
  onSelectComplaint: (publicId: string) => void;
  liveUpdateTick: number;
}

export const GeographicMapView: React.FC<GeographicMapViewProps> = ({
  complaints,
  onSelectComplaint,
  liveUpdateTick,
}) => {
  const [hotspots, setHotspots] = useState<HotspotCluster[]>([]);
  const [epsMeters, setEpsMeters] = useState<number>(450);
  const [minSamples, setMinSamples] = useState<number>(3);
  const [includeResolved, setIncludeResolved] = useState<boolean>(true);
  const [showHotspots, setShowHotspots] = useState<boolean>(true);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'map' | 'accessible_list'>('map');
  const [loadingHotspots, setLoadingHotspots] = useState<boolean>(false);

  const loadHotspots = async () => {
    setLoadingHotspots(true);
    try {
      const res = await fetch(
        `/api/hotspots?eps_meters=${epsMeters}&min_samples=${minSamples}&include_resolved=${includeResolved}`
      );
      if (res.ok) {
        const data = await res.json();
        setHotspots(data.hotspots || []);
      }
    } catch {
      // Ignore transient hotspot fetch failure
    } finally {
      setLoadingHotspots(false);
    }
  };

  useEffect(() => {
    loadHotspots();
  }, [epsMeters, minSamples, includeResolved, liveUpdateTick, complaints.length]);

  const filteredComplaints = complaints.filter((c) => {
    if (!includeResolved && c.status === 'Resolved') return false;
    if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
    if (priorityFilter !== 'All' && c.priority_level !== priorityFilter) return false;
    return true;
  });

  const withCoords = filteredComplaints.filter(
    (c) =>
      typeof c.latitude === 'number' &&
      !Number.isNaN(c.latitude) &&
      typeof c.longitude === 'number' &&
      !Number.isNaN(c.longitude)
  );

  const missingCoords = filteredComplaints.filter(
    (c) => c.latitude === null || c.longitude === null
  );

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700">
            Stage 03 · Spatial Intelligence & DBSCAN Hotspot Clustering
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Geographic Map & Hotspot Discovery
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Displays verified complaint coordinates and groups nearby reports into spatial clusters. Never fabricates coordinates for reports submitted without GPS.
          </p>
        </div>

        {/* Interactive View Switcher (Map vs Accessible List) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start">
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'map'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Interactive Map</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('accessible_list')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'accessible_list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Accessible List Alternative</span>
          </button>
        </div>
      </div>

      {/* Filter & DBSCAN Configuration Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Category Filter
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
          >
            <option value="All">All Categories</option>
            {SUPPORTED_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Priority Filter
          </label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
          >
            <option value="All">All Priorities</option>
            <option value="Critical">Critical (3.50–5.00)</option>
            <option value="High">High (2.50–3.49)</option>
            <option value="Medium">Medium (1.50–2.49)</option>
            <option value="Low">Low (0.00–1.49)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            DBSCAN Cluster Radius
          </label>
          <select
            value={epsMeters}
            onChange={(e) => setEpsMeters(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono-tabular text-slate-900"
          >
            <option value={300}>300 meters (Tight)</option>
            <option value={450}>450 meters (Default)</option>
            <option value={700}>700 meters (Ward-wide)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Min Reports per Hotspot
          </label>
          <select
            value={minSamples}
            onChange={(e) => setMinSamples(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono-tabular text-slate-900"
          >
            <option value={2}>2+ reports</option>
            <option value={3}>3+ reports (Default)</option>
            <option value={4}>4+ reports</option>
          </select>
        </div>

        <div className="flex items-center gap-4 pb-1.5">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showHotspots}
              onChange={(e) => setShowHotspots(e.target.checked)}
              className="rounded border-slate-300 text-teal-600"
            />
            <span>Hotspot Overlays</span>
          </label>
        </div>

        <div className="flex items-center gap-4 pb-1.5">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeResolved}
              onChange={(e) => setIncludeResolved(e.target.checked)}
              className="rounded border-slate-300 text-teal-600"
            />
            <span>Include Resolved</span>
          </label>
        </div>
      </div>

      {/* Main Map + Hotspot Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          {viewMode === 'map' ? (
            withCoords.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
                <h2 className="text-base font-semibold text-slate-900">
                  No Geocoded Reports Match Current Filters
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Adjust category or priority filters above, or switch to the Accessible List Alternative to inspect reports submitted without GPS coordinates ({missingCoords.length} unmapped reports).
                </p>
              </div>
            ) : (
              <OperationsLeafletMap
                complaints={withCoords}
                hotspots={hotspots}
                showHotspots={showHotspots}
                selectedHotspotId={selectedHotspotId}
                onSelectComplaint={onSelectComplaint}
                onSelectHotspot={setSelectedHotspotId}
              />
            )
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Accessible Coordinate & Ward Directory ({filteredComplaints.length} reports)
                </h2>
                <span className="text-xs text-slate-500 font-mono-tabular">
                  {withCoords.length} mapped · {missingCoords.length} without GPS
                </span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {filteredComplaints.map((c) => (
                  <div
                    key={c.public_id}
                    className="px-5 py-3.5 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono-tabular text-slate-500">
                        <button
                          type="button"
                          onClick={() => onSelectComplaint(c.public_id)}
                          className="font-bold text-teal-700 hover:underline cursor-pointer"
                        >
                          {c.public_id}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">{c.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {c.priority_level} ({c.priority_score.toFixed(2)})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{c.status}</span>
                      </div>
                      <div className="text-slate-800 font-medium">{c.location_name}</div>
                      <div className="text-slate-600">{c.summary}</div>
                    </div>
                    <div className="text-right font-mono-tabular text-slate-500 shrink-0">
                      {c.latitude !== null && c.longitude !== null
                        ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`
                        : 'No GPS coordinates'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend & Distinction Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-slate-900">Marker Priority Legend:</span>
              {(
                [
                  { level: 'Critical', color: 'bg-red-600' },
                  { level: 'High', color: 'bg-amber-600' },
                  { level: 'Medium', color: 'bg-sky-600' },
                  { level: 'Low', color: 'bg-slate-600' },
                ] as Array<{ level: PriorityLevel; color: string }>
              ).map((item) => (
                <span key={item.level} className="inline-flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${item.color} inline-block`} />
                  <span>{item.level}</span>
                </span>
              ))}
            </div>
            <div className="font-mono-tabular text-slate-500">
              Showing {withCoords.length} mapped markers · {missingCoords.length} reports without coordinates
            </div>
          </div>

          {/* Unmapped Reports Notice */}
          {missingCoords.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <MapPinOff className="w-4 h-4 text-slate-500" />
                  <span>
                    Reports Submitted Without GPS Coordinates ({missingCoords.length})
                  </span>
                </div>
                <span className="text-slate-500">
                  Excluded from spatial clustering; tracked by ward name
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {missingCoords.slice(0, 8).map((mc) => (
                  <button
                    key={mc.public_id}
                    type="button"
                    onClick={() => onSelectComplaint(mc.public_id)}
                    className="text-slate-700 hover:text-teal-700 underline font-mono-tabular cursor-pointer"
                  >
                    {mc.public_id} ({mc.location_name.split(',')[0]})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Detected Geographic Hotspots (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">
                  Detected Geographic Hotspots ({hotspots.length})
                </h2>
              </div>
              {selectedHotspotId && (
                <button
                  type="button"
                  onClick={() => setSelectedHotspotId(null)}
                  className="text-xs text-teal-700 hover:underline cursor-pointer"
                >
                  Reset Zoom
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Calculated dynamically from database coordinates via spatial DBSCAN (radius &le; {epsMeters}m, min {minSamples} reports). Distinguishes multi-problem area clusters from single duplicate reports.
            </p>

            {loadingHotspots ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Calculating spatial clusters...
              </div>
            ) : hotspots.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                No geographic clusters found matching current radius ({epsMeters}m) and minimum report count ({minSamples}).
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[560px] overflow-y-auto pr-1">
                {hotspots.map((cluster) => {
                  const isSelected = selectedHotspotId === cluster.cluster_id;
                  const catList = Object.entries(cluster.categories)
                    .map(([c, cnt]) => `${cnt} ${c}`)
                    .join(' · ');

                  return (
                    <div
                      key={cluster.cluster_id}
                      onClick={() => setSelectedHotspotId(cluster.cluster_id)}
                      className={`p-4 rounded-lg border transition-colors cursor-pointer space-y-2.5 text-xs ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/40'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-mono-tabular">
                        <span className="font-bold text-slate-900 text-sm">
                          {cluster.cluster_id} · {cluster.primary_area}
                        </span>
                        <span
                          className={`font-semibold ${
                            cluster.highest_priority === 'Critical'
                              ? 'text-red-700'
                              : 'text-teal-700'
                          }`}
                        >
                          {cluster.report_count} reports
                        </span>
                      </div>

                      <div className="text-slate-600 font-mono-tabular">
                        Avg Score: {cluster.avg_priority_score.toFixed(2)}/5.00 ·{' '}
                        {cluster.unresolved_count} unresolved ·{' '}
                        {cluster.is_multi_problem
                          ? 'Multi-Category Hotspot'
                          : 'Single-Category Cluster'}
                      </div>

                      <div className="text-slate-800 font-medium">{catList}</div>

                      <p className="text-slate-600 leading-relaxed">{cluster.explanation}</p>

                      <div className="pt-2 border-t border-slate-100 text-slate-500">
                        <strong className="text-slate-700">Hotspot vs. Duplicate Note:</strong>{' '}
                        {cluster.distinction_note}
                      </div>

                      <div className="pt-1 flex flex-wrap gap-1.5">
                        {cluster.complaint_ids.slice(0, 6).map((cid) => (
                          <button
                            key={cid}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectComplaint(cid);
                            }}
                            className="font-mono-tabular text-teal-700 hover:underline cursor-pointer"
                          >
                            {cid}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
