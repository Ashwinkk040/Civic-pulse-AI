import { GoogleGenAI, Type } from '@google/genai';
import { ActionBrief, AnalyticsSummary, Complaint, HotspotCluster } from '../shared/types.ts';

function hasValidGeminiApiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 10 && key !== 'MY_GEMINI_API_KEY');
}

export function generateDeterministicActionBrief(
  complaints: Complaint[],
  analytics: AnalyticsSummary,
  hotspots: HotspotCluster[]
): ActionBrief {
  const nowIso = new Date().toISOString();

  if (complaints.length === 0) {
    return {
      generated_at: nowIso,
      method: 'deterministic-analytics-synthesis',
      headline: 'No active civic complaints currently recorded in the database.',
      narrative:
        'The operations queue is currently empty. Submit a citizen complaint or load the synthetic demonstration dataset to generate geographic cluster insights and operational action briefs.',
      key_observations: ['0 total complaints recorded.', '0 geographic hotspots active.'],
      recommendations: [
        'Recommendation: Monitor incoming citizen submission channels or load demonstration data for training.',
      ],
      disclaimer:
        'Operational recommendations are generated from current database state and do not represent confirmed field inspections unless recorded in complaint status history.',
      stats_snapshot: {
        total: 0,
        unresolved: 0,
        critical_open: 0,
        hotspot_count: 0,
        pending_duplicates: 0,
      },
    };
  }

  const openComplaints = complaints.filter((c) => c.status !== 'Resolved');
  const criticalOpen = openComplaints.filter((c) => c.priority_level === 'Critical');
  const pendingDuplicates = complaints.filter((c) => c.duplicate_status === 'potential');
  const unassignedCritical = criticalOpen.filter((c) => !c.assigned_team);

  const topCategories = Object.entries(analytics.category_distribution)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0);

  const topCatText =
    topCategories.length > 0
      ? `${topCategories[0][0]} (${topCategories[0][1]} reports)`
      : 'General Civic Issues';

  const topHotspot = hotspots[0];

  const narrativeParts: string[] = [];
  narrativeParts.push(
    `Currently tracking ${analytics.unresolved_complaints} unresolved civic complaint(s) out of ${analytics.total_complaints} total reports, led by ${topCatText}.`
  );

  if (topHotspot) {
    const catList = Object.entries(topHotspot.categories)
      .map(([c, n]) => `${n} ${c}`)
      .join(', ');
    narrativeParts.push(
      `Several reports (${topHotspot.report_count} complaints: ${catList}) are concentrated near ${topHotspot.primary_area} (${topHotspot.cluster_id}).`
    );
  }

  if (pendingDuplicates.length > 0) {
    narrativeParts.push(
      `${pendingDuplicates.length} report(s) have been flagged as possible duplicates awaiting officer confirmation.`
    );
  }

  if (criticalOpen.length > 0) {
    narrativeParts.push(
      `${criticalOpen.length} unresolved report(s) indicate Critical priority or potential public safety hazards.`
    );
  }

  const observations: string[] = [
    `${analytics.unresolved_complaints} open complaints (${criticalOpen.length} Critical, ${unassignedCritical.length} unassigned Critical).`,
    topHotspot
      ? `Primary geographic hotspot at ${topHotspot.primary_area} contains ${topHotspot.report_count} clustered reports (${topHotspot.unresolved_count} unresolved).`
      : 'No dense geographic hotspots (>=3 reports within 450m) detected in current coordinate set.',
    `${pendingDuplicates.length} unverified duplicate candidate pair(s) and ${analytics.confirmed_duplicates} officer-confirmed duplicate(s).`,
  ];

  const recommendations: string[] = [];
  if (unassignedCritical.length > 0) {
    recommendations.push(
      `Recommendation: Assign a response team to ${unassignedCritical.length} unassigned Critical report(s) (${unassignedCritical
        .slice(0, 3)
        .map((c) => c.public_id)
        .join(', ')}) and prioritize immediate safety hazard verification.`
    );
  }
  if (topHotspot) {
    recommendations.push(
      `Recommendation: Inspect ${topHotspot.primary_area} (${topHotspot.cluster_id}) to address ${topHotspot.unresolved_count} clustered open issue(s) in a coordinated field visit.`
    );
  }
  if (pendingDuplicates.length > 0) {
    recommendations.push(
      `Recommendation: Review and confirm or reject ${pendingDuplicates.length} flagged duplicate candidate(s) to consolidate field work orders without deleting citizen records.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Recommendation: Continue routine ward status updates and close out resolved field tickets.'
    );
  }

  return {
    generated_at: nowIso,
    method: 'deterministic-analytics-synthesis',
    headline: topHotspot
      ? `${criticalOpen.length} Critical open issues; primary concentration near ${topHotspot.primary_area} (${topHotspot.report_count} reports)`
      : `${analytics.unresolved_complaints} unresolved complaints across municipal wards (${criticalOpen.length} Critical)`,
    narrative: narrativeParts.join(' '),
    key_observations: observations,
    recommendations,
    disclaimer:
      'Recommendations are generated from stored complaint records for operational triage. No field inspection or repair is confirmed unless recorded in the official complaint status history.',
    stats_snapshot: {
      total: analytics.total_complaints,
      unresolved: analytics.unresolved_complaints,
      critical_open: criticalOpen.length,
      hotspot_count: hotspots.length,
      pending_duplicates: pendingDuplicates.length,
    },
  };
}

export async function generateActionBriefWithFallback(
  complaints: Complaint[],
  analytics: AnalyticsSummary,
  hotspots: HotspotCluster[],
  enableExternalAI: boolean = true
): Promise<ActionBrief> {
  const detBrief = generateDeterministicActionBrief(complaints, analytics, hotspots);

  if (!enableExternalAI || !hasValidGeminiApiKey() || complaints.length === 0) {
    return detBrief;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini action brief timeout')), 4500)
    );

    const aiPromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Generate a concise municipal operations action brief from these verified database metrics:
Total: ${detBrief.stats_snapshot.total}, Unresolved: ${detBrief.stats_snapshot.unresolved}, Critical Open: ${detBrief.stats_snapshot.critical_open}, Hotspots: ${detBrief.stats_snapshot.hotspot_count}, Pending Duplicates: ${detBrief.stats_snapshot.pending_duplicates}.
Baseline summary: ${detBrief.narrative}`,
      config: {
        systemInstruction:
          'You are a municipal operations advisor. Never claim a maintenance team has inspected or completed work unless explicitly stated. Prefix every recommendation with "Recommendation:". Return factual JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            narrative: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['headline', 'narrative', 'recommendations'],
        },
      },
    });

    const response = await Promise.race([aiPromise, timeoutPromise]);
    const parsed = JSON.parse((response.text ?? '{}').trim());

    return {
      ...detBrief,
      method: 'gemini-3.8-flash',
      headline: parsed.headline || detBrief.headline,
      narrative: parsed.narrative || detBrief.narrative,
      recommendations:
        Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
          ? parsed.recommendations.map((r: string) =>
              r.startsWith('Recommendation:') ? r : `Recommendation: ${r}`
            )
          : detBrief.recommendations,
    };
  } catch {
    return detBrief;
  }
}
