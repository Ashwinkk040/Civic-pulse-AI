import L from 'leaflet';
import React, { useEffect, useRef, useState } from 'react';
import { Complaint, HotspotCluster, PriorityLevel } from '../shared/types.ts';

const PRIORITY_COLORS: Record<PriorityLevel, { fill: string; border: string; label: string }> = {
  Critical: { fill: '#dc2626', border: '#991b1b', label: 'Critical' },
  High: { fill: '#d97706', border: '#92400e', label: 'High' },
  Medium: { fill: '#0284c7', border: '#075985', label: 'Medium' },
  Low: { fill: '#475569', border: '#1e293b', label: 'Low' },
};

function createPriorityMarkerIcon(priority: PriorityLevel, isSelected: boolean): L.DivIcon {
  const color = PRIORITY_COLORS[priority] || PRIORITY_COLORS.Low;
  const size = isSelected ? 22 : 16;
  const ring = isSelected ? `box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.35);` : '';

  return L.divIcon({
    className: 'custom-civic-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color.fill};
      border: 2.5px solid #ffffff;
      outline: 1.5px solid ${color.border};
      border-radius: 50%;
      ${ring}
      transition: transform 150ms ease;
    " title="${color.label} Priority"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createHotspotCentroidIcon(cluster: HotspotCluster): L.DivIcon {
  const isCritical = cluster.highest_priority === 'Critical';
  const bg = isCritical ? '#991b1b' : '#0f766e';

  return L.divIcon({
    className: 'custom-hotspot-centroid',
    html: `<div style="
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      background-color: ${bg};
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
      white-space: nowrap;
    ">${cluster.cluster_id}: ${cluster.report_count} reports</div>`,
    iconSize: [110, 24],
    iconAnchor: [55, 12],
  });
}

interface PinPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onSelectCoordinates: (lat: number, lng: number) => void;
}

export const LocationPinPickerMap: React.FC<PinPickerMapProps> = ({
  latitude,
  longitude,
  onSelectCoordinates,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const defaultLat = latitude ?? 12.9716;
    const defaultLng = longitude ?? 77.5946;

    const map = L.map(containerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 13,
      scrollWheelZoom: true,
    });

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });

    tileLayer.addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      onSelectCoordinates(lat, lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (latitude !== null && longitude !== null && !Number.isNaN(latitude) && !Number.isNaN(longitude)) {
      const pos: L.LatLngExpression = [latitude, longitude];
      if (!markerRef.current) {
        const pinIcon = L.divIcon({
          className: 'report-pin-icon',
          html: `<div style="
            width: 20px;
            height: 20px;
            background: #0d9488;
            border: 3px solid #ffffff;
            outline: 2px solid #0f766e;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        markerRef.current = L.marker(pos, { icon: pinIcon }).addTo(map);
      } else {
        markerRef.current.setLatLng(pos);
      }
      map.panTo(pos);
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [latitude, longitude]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-64 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden"
      />
      {tileError && (
        <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          Map tiles could not be loaded (network restricted). Interactive coordinate selection still functions on the local grid canvas.
        </div>
      )}
    </div>
  );
};

interface OperationsMapProps {
  complaints: Complaint[];
  hotspots: HotspotCluster[];
  showHotspots: boolean;
  selectedHotspotId: string | null;
  onSelectComplaint: (publicId: string) => void;
  onSelectHotspot: (clusterId: string | null) => void;
}

export const OperationsLeafletMap: React.FC<OperationsMapProps> = ({
  complaints,
  hotspots,
  showHotspots,
  selectedHotspotId,
  onSelectComplaint,
  onSelectHotspot,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 12,
      scrollWheelZoom: true,
    });

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    tiles.on('tileerror', () => {
      setTileError(true);
    });

    tiles.addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Render geographic hotspot circles & centroids first (distinct from individual markers)
    if (showHotspots) {
      for (const cluster of hotspots) {
        const isSelected = selectedHotspotId === cluster.cluster_id;
        const strokeColor =
          cluster.highest_priority === 'Critical' ? '#dc2626' : '#0d9488';

        const circle = L.circle([cluster.center_lat, cluster.center_lng], {
          radius: cluster.radius_meters,
          color: strokeColor,
          weight: isSelected ? 3 : 2,
          dashArray: '6, 6',
          fillColor: strokeColor,
          fillOpacity: isSelected ? 0.18 : 0.1,
        });

        circle.on('click', () => {
          onSelectHotspot(cluster.cluster_id);
        });

        circle.addTo(layerGroup);

        const centroidMarker = L.marker([cluster.center_lat, cluster.center_lng], {
          icon: createHotspotCentroidIcon(cluster),
        });

        const catBreakdown = Object.entries(cluster.categories)
          .map(([c, n]) => `${n} ${c}`)
          .join(' · ');

        const popupDiv = document.createElement('div');
        popupDiv.className = 'text-xs text-slate-800 space-y-1.5 min-w-[210px]';
        popupDiv.innerHTML = `
          <div class="font-semibold text-slate-900">${cluster.cluster_id} — ${cluster.primary_area}</div>
          <div class="text-slate-600">${cluster.report_count} clustered reports · Avg Priority ${cluster.avg_priority_score.toFixed(2)}/5.00</div>
          <div class="text-slate-600">${catBreakdown}</div>
          <div class="text-slate-500 pt-1 border-t border-slate-100">${cluster.distinction_note}</div>
        `;

        centroidMarker.bindPopup(popupDiv);
        centroidMarker.on('click', () => {
          onSelectHotspot(cluster.cluster_id);
        });
        centroidMarker.addTo(layerGroup);
      }
    }

    // 2. Render individual complaint markers
    const validComplaints = complaints.filter(
      (c) =>
        typeof c.latitude === 'number' &&
        !Number.isNaN(c.latitude) &&
        typeof c.longitude === 'number' &&
        !Number.isNaN(c.longitude)
    );

    for (const c of validComplaints) {
      const marker = L.marker([c.latitude as number, c.longitude as number], {
        icon: createPriorityMarkerIcon(c.priority_level, false),
      });

      const popupContainer = document.createElement('div');
      popupContainer.className = 'text-xs text-slate-800 space-y-1.5 min-w-[220px]';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-2 font-mono-tabular text-slate-500';
      header.textContent = `${c.public_id} · ${c.priority_level} (${c.priority_score.toFixed(2)})`;

      const title = document.createElement('div');
      title.className = 'font-semibold text-slate-900 text-sm';
      title.textContent = `${c.category} — ${c.location_name}`;

      const summary = document.createElement('div');
      summary.className = 'text-slate-600 line-clamp-2';
      summary.textContent = c.summary;

      const meta = document.createElement('div');
      meta.className = 'text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between';
      meta.innerHTML = `<span>Status: <strong>${c.status}</strong></span>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'mt-1.5 w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded text-xs transition-colors cursor-pointer';
      btn.textContent = 'Inspect Complaint Details';
      btn.onclick = () => {
        onSelectComplaint(c.public_id);
      };

      popupContainer.appendChild(header);
      popupContainer.appendChild(title);
      popupContainer.appendChild(summary);
      popupContainer.appendChild(meta);
      popupContainer.appendChild(btn);

      marker.bindPopup(popupContainer);
      marker.addTo(layerGroup);
    }

    // Focus on selected hotspot if active
    if (selectedHotspotId) {
      const targetCluster = hotspots.find((h) => h.cluster_id === selectedHotspotId);
      if (targetCluster) {
        map.setView([targetCluster.center_lat, targetCluster.center_lng], 15, {
          animate: true,
        });
      }
    }
  }, [complaints, hotspots, showHotspots, selectedHotspotId]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[520px] rounded-lg border border-slate-200 bg-slate-100 overflow-hidden"
      />
      {tileError && (
        <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Note: OpenStreetMap tile server is unreachable in this network environment. Markers and DBSCAN geographic hotspot overlays are rendered accurately on the coordinate canvas; use the accessible list view alongside the map for street-level details.
        </div>
      )}
    </div>
  );
};
