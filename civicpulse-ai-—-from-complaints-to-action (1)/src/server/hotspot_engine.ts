import { Complaint, HotspotCluster, PriorityLevel } from '../shared/types.ts';
import { haversineDistanceMeters } from './duplicate_detector.ts';

export interface HotspotConfig {
  epsMeters?: number;
  minSamples?: number;
  includeResolved?: boolean;
}

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

/**
 * Spatial DBSCAN clustering on complaints with valid geographic coordinates.
 * Groups nearby civic complaints into geographic clusters and distinguishes
 * multi-report spatial hotspots from confirmed single duplicate incidents.
 */
export function detectGeographicHotspots(
  complaints: Array<
    Pick<
      Complaint,
      | 'id'
      | 'public_id'
      | 'category'
      | 'location_name'
      | 'latitude'
      | 'longitude'
      | 'priority_level'
      | 'priority_score'
      | 'status'
      | 'duplicate_status'
    >
  >,
  config: HotspotConfig = {}
): HotspotCluster[] {
  const epsMeters = config.epsMeters ?? 450;
  const minSamples = config.minSamples ?? 3;
  const includeResolved = config.includeResolved ?? true;

  // Filter strictly for usable coordinates
  const validPoints = complaints.filter((c) => {
    if (!includeResolved && c.status === 'Resolved') return false;
    return (
      typeof c.latitude === 'number' &&
      !Number.isNaN(c.latitude) &&
      Number.isFinite(c.latitude) &&
      c.latitude >= -90 &&
      c.latitude <= 90 &&
      typeof c.longitude === 'number' &&
      !Number.isNaN(c.longitude) &&
      Number.isFinite(c.longitude) &&
      c.longitude >= -180 &&
      c.longitude <= 180
    );
  });

  if (validPoints.length < minSamples) {
    return [];
  }

  const n = validPoints.length;
  const visited = new Array<boolean>(n).fill(false);
  const clusterLabels = new Array<number>(n).fill(-1); // -1 = noise/unassigned
  let currentClusterId = 0;

  function regionQuery(idx: number): number[] {
    const p1 = validPoints[idx];
    const neighbors: number[] = [];
    for (let j = 0; j < n; j++) {
      const p2 = validPoints[j];
      const dist = haversineDistanceMeters(
        p1.latitude as number,
        p1.longitude as number,
        p2.latitude as number,
        p2.longitude as number
      );
      if (dist <= epsMeters) {
        neighbors.push(j);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;

    const neighbors = regionQuery(i);
    if (neighbors.length < minSamples) {
      clusterLabels[i] = -1; // Noise
    } else {
      const clusterIdx = currentClusterId++;
      clusterLabels[i] = clusterIdx;

      const seedQueue = [...neighbors];
      const inQueue = new Set<number>(seedQueue);

      let qIdx = 0;
      while (qIdx < seedQueue.length) {
        const currentPt = seedQueue[qIdx++];
        if (!visited[currentPt]) {
          visited[currentPt] = true;
          const currentNeighbors = regionQuery(currentPt);
          if (currentNeighbors.length >= minSamples) {
            for (const nb of currentNeighbors) {
              if (!inQueue.has(nb)) {
                inQueue.add(nb);
                seedQueue.push(nb);
              }
            }
          }
        }
        if (clusterLabels[currentPt] === -1) {
          clusterLabels[currentPt] = clusterIdx;
        }
      }
    }
  }

  // Group points by cluster label
  const grouped = new Map<number, typeof validPoints>();
  for (let i = 0; i < n; i++) {
    const lbl = clusterLabels[i];
    if (lbl >= 0) {
      const arr = grouped.get(lbl) || [];
      arr.push(validPoints[i]);
      grouped.set(lbl, arr);
    }
  }

  const hotspots: HotspotCluster[] = [];

  for (const [lbl, members] of grouped.entries()) {
    if (members.length < minSamples) continue;

    const sumLat = members.reduce((acc, m) => acc + (m.latitude as number), 0);
    const sumLng = members.reduce((acc, m) => acc + (m.longitude as number), 0);
    const centerLat = Number((sumLat / members.length).toFixed(6));
    const centerLng = Number((sumLng / members.length).toFixed(6));

    let maxDist = 120;
    for (const m of members) {
      const d = haversineDistanceMeters(
        centerLat,
        centerLng,
        m.latitude as number,
        m.longitude as number
      );
      if (d > maxDist) maxDist = d;
    }

    const categories: Record<string, number> = {};
    const priorities: Record<PriorityLevel, number> = {
      Low: 0,
      Medium: 0,
      High: 0,
      Critical: 0,
    };
    const areaFreq: Record<string, number> = {};

    let highestPriority: PriorityLevel = 'Low';
    let scoreSum = 0;
    let unresolvedCount = 0;
    let confirmedDupsInCluster = 0;

    for (const m of members) {
      categories[m.category] = (categories[m.category] || 0) + 1;
      priorities[m.priority_level] = (priorities[m.priority_level] || 0) + 1;
      if (PRIORITY_RANK[m.priority_level] > PRIORITY_RANK[highestPriority]) {
        highestPriority = m.priority_level;
      }
      scoreSum += m.priority_score;
      if (m.status !== 'Resolved') {
        unresolvedCount++;
      }
      if (m.duplicate_status === 'confirmed') {
        confirmedDupsInCluster++;
      }
      const areaPrefix = (m.location_name || 'Municipal Zone').split(',')[0].trim();
      areaFreq[areaPrefix] = (areaFreq[areaPrefix] || 0) + 1;
    }

    const primaryArea =
      Object.entries(areaFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Central Municipal Zone';

    const distinctCategories = Object.keys(categories);
    const isMultiProblem = distinctCategories.length >= 2;
    const avgScore = Number((scoreSum / members.length).toFixed(2));

    const catSummary = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([c, cnt]) => `${cnt} ${c}`)
      .join(', ');

    const explanation = isMultiProblem
      ? `Spatial DBSCAN cluster (radius <= ${epsMeters}m) detected ${members.length} reports near ${primaryArea} spanning ${distinctCategories.length} distinct infrastructure categories (${catSummary}), indicating compound civic stress.`
      : `Spatial DBSCAN cluster (radius <= ${epsMeters}m) detected a concentration of ${members.length} ${distinctCategories[0]} reports near ${primaryArea} (avg priority ${avgScore.toFixed(2)}/5.00).`;

    const distinctionNote =
      confirmedDupsInCluster > 0
        ? `Contains ${members.length - confirmedDupsInCluster} distinct reported events and ${confirmedDupsInCluster} confirmed duplicate report(s). A geographic hotspot reflects spatial density across an area rather than a single duplicate report.`
        : `All ${members.length} reports in this cluster are currently tracked as independent spatial reports (0 confirmed merges). Officer inspection is required to determine whether any share a single root cause.`;

    const recommendedAction = isMultiProblem
      ? `Coordinate joint multi-department field inspection (${distinctCategories.slice(0, 3).join(' + ')}) at ${primaryArea} to address interconnected root causes.`
      : `Deploy targeted ${distinctCategories[0]} maintenance crew to sweep ${primaryArea} and resolve all ${unresolvedCount} open ticket(s) in a single dispatch.`;

    hotspots.push({
      cluster_id: `HS-${String(lbl + 1).padStart(2, '0')}`,
      center_lat: centerLat,
      center_lng: centerLng,
      radius_meters: Math.round(maxDist + 65),
      report_count: members.length,
      primary_area: primaryArea,
      categories,
      priorities,
      highest_priority: highestPriority,
      avg_priority_score: avgScore,
      is_multi_problem: isMultiProblem,
      unresolved_count: unresolvedCount,
      complaint_ids: members.map((m) => m.public_id),
      explanation,
      recommended_action: recommendedAction,
      distinction_note: distinctionNote,
    });
  }

  return hotspots.sort((a, b) => {
    if (b.avg_priority_score !== a.avg_priority_score) {
      return b.avg_priority_score - a.avg_priority_score;
    }
    return b.report_count - a.report_count;
  });
}
