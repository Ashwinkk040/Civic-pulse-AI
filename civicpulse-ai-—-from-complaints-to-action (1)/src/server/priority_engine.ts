import { ComplaintCategory, PriorityBreakdown, PriorityLevel } from '../shared/types.ts';
import { normalizeText } from './ai_engine.ts';

export function clampFactor(val: number): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(5, Number(val.toFixed(2))));
}

/**
 * Computes exact weighted score using:
 * PriorityScore = 0.35 * Urgency + 0.35 * SafetyImpact + 0.20 * PeopleAffected + 0.10 * Recurrence
 */
export function computeWeightedScore(
  urgency: number,
  safetyImpact: number,
  peopleAffected: number,
  recurrence: number
): number {
  const u = clampFactor(urgency);
  const s = clampFactor(safetyImpact);
  const p = clampFactor(peopleAffected);
  const r = clampFactor(recurrence);

  const raw = 0.35 * u + 0.35 * s + 0.20 * p + 0.10 * r;
  return Math.max(0, Math.min(5, Number(raw.toFixed(2))));
}

/**
 * Maps numeric score in [0.00, 5.00] to PriorityLevel with exact boundary handling:
 * - Low: 0.00–1.49
 * - Medium: 1.50–2.49
 * - High: 2.50–3.49
 * - Critical: 3.50–5.00
 */
export function scoreToPriorityLevel(score: number): PriorityLevel {
  const rounded = Number(Math.max(0, Math.min(5, score)).toFixed(2));
  if (rounded >= 3.5) return 'Critical';
  if (rounded >= 2.5) return 'High';
  if (rounded >= 1.5) return 'Medium';
  return 'Low';
}

const CATEGORY_BASELINES: Record<
  ComplaintCategory,
  { urgency: number; safety: number; affected: number }
> = {
  'Public Safety': { urgency: 4.0, safety: 4.2, affected: 3.2 },
  Waterlogging: { urgency: 3.2, safety: 2.8, affected: 3.5 },
  Drainage: { urgency: 2.8, safety: 2.4, affected: 3.0 },
  'Road Damage': { urgency: 2.5, safety: 2.6, affected: 3.0 },
  Streetlight: { urgency: 2.2, safety: 2.5, affected: 2.4 },
  'Waste Management': { urgency: 2.0, safety: 1.8, affected: 2.6 },
  Other: { urgency: 1.4, safety: 1.2, affected: 1.5 },
};

const SEVERE_HAZARD_TRIGGERS = [
  'open manhole',
  'uncovered manhole',
  'missing manhole cover',
  'live wire',
  'exposed wire',
  'sparking transformer',
  'electric shock',
  'collapsed wall',
  'deep sinkhole',
  'gas leak',
  'open trench',
];

const HIGH_URGENCY_TERMS = [
  'urgent',
  'immediately',
  'emergency',
  'blocked traffic',
  'accident',
  'injured',
  'overflowing rapidly',
  'impassable',
  'completely dark',
  'main arterial',
];

const LOW_SEVERITY_TERMS = [
  'minor',
  'small',
  'cosmetic',
  'slightly',
  'single bin',
  'faded paint',
  'aesthetic',
  'occasional',
];

const HIGH_CROWD_TERMS = [
  'school',
  'hospital',
  'clinic',
  'bus stop',
  'metro station',
  'market',
  'junction',
  'intersection',
  'highway',
  'main road',
  'pedestrian crossing',
  'hundreds',
];

export interface PriorityEvaluationInput {
  description: string;
  category: ComplaintCategory;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  historicalNearbyCount?: number;
  enableSafetyOverride?: boolean;
}

export function calculateExplainablePriority(input: PriorityEvaluationInput): PriorityBreakdown {
  const normalized = normalizeText(`${input.description} ${input.locationName || ''}`);
  const baseline = CATEGORY_BASELINES[input.category] || CATEGORY_BASELINES.Other;

  let urgency = baseline.urgency;
  let safetyImpact = baseline.safety;
  let peopleAffected = baseline.affected;

  const assumptions: string[] = [];
  const missingInfo: string[] = [];

  // 1. Urgency adjustments (estimated from text)
  const matchedUrgency = HIGH_URGENCY_TERMS.filter((t) => normalized.includes(t));
  const matchedLow = LOW_SEVERITY_TERMS.filter((t) => normalized.includes(t));

  if (matchedUrgency.length > 0) {
    urgency = clampFactor(urgency + Math.min(1.8, matchedUrgency.length * 0.7));
    assumptions.push(
      `Urgency estimated upward (+${Math.min(1.8, matchedUrgency.length * 0.7).toFixed(1)}) due to urgency indicators in report text (${matchedUrgency.slice(0, 2).join(', ')}).`
    );
  } else if (matchedLow.length > 0) {
    urgency = clampFactor(urgency - 1.1);
    safetyImpact = clampFactor(safetyImpact - 1.0);
    peopleAffected = clampFactor(peopleAffected - 0.8);
    assumptions.push(
      `Urgency and impact estimated downward based on low-severity indicators (${matchedLow.slice(0, 2).join(', ')}).`
    );
  } else {
    assumptions.push(
      `Baseline urgency (${urgency.toFixed(1)}/5) inferred as an estimate from "${input.category}" category norms.`
    );
  }

  // 2. Safety Impact adjustments (estimated from text)
  const matchedHazards = SEVERE_HAZARD_TRIGGERS.filter((t) => normalized.includes(t));
  if (matchedHazards.length > 0) {
    safetyImpact = clampFactor(Math.max(4.6, safetyImpact + 1.8));
    urgency = clampFactor(Math.max(4.4, urgency + 1.4));
    assumptions.push(
      `Safety impact estimated at high severity (${safetyImpact.toFixed(1)}/5) due to explicit hazard phrasing (${matchedHazards.join(', ')}).`
    );
  }

  // 3. People Affected adjustments (estimated from location/text context)
  const matchedCrowd = HIGH_CROWD_TERMS.filter((t) => normalized.includes(t));
  if (matchedCrowd.length > 0) {
    peopleAffected = clampFactor(peopleAffected + Math.min(1.8, matchedCrowd.length * 0.65));
    assumptions.push(
      `Estimated people affected increased (${peopleAffected.toFixed(1)}/5) due to high-footfall/traffic context (${matchedCrowd.slice(0, 3).join(', ')}).`
    );
  } else {
    assumptions.push(
      `People affected (${peopleAffected.toFixed(1)}/5) is an estimate inferred from text; no verified traffic or pedestrian telemetry is attached.`
    );
  }

  // 4. Recurrence derived from historical database records
  const histCount = Math.max(0, input.historicalNearbyCount ?? 0);
  let recurrence = 0.5;
  if (histCount > 0) {
    recurrence = clampFactor(Math.min(5.0, 1.0 + histCount * 1.0));
    assumptions.push(
      `Recurrence (${recurrence.toFixed(1)}/5) derived from ${histCount} historical report(s) in the database matching nearby coordinates or area.`
    );
  } else if (
    normalized.includes('again') ||
    normalized.includes('repeatedly') ||
    normalized.includes('every week') ||
    normalized.includes('for weeks') ||
    normalized.includes('months')
  ) {
    recurrence = 2.5;
    assumptions.push(
      `Recurrence (2.5/5) estimated from citizen report text indicating persistence; 0 prior linked database records found.`
    );
  } else {
    recurrence = 0.5;
    assumptions.push(
      `Recurrence set to baseline (0.5/5) based on 0 prior matching reports in database.`
    );
  }

  // Missing or uncertain information disclosure
  if (input.latitude === null || input.latitude === undefined || input.longitude === null || input.longitude === undefined) {
    missingInfo.push('Exact GPS coordinates were not provided; geographic proximity relies on area name only.');
  }
  if ((input.description || '').trim().split(/\s+/).length < 10) {
    missingInfo.push('Brief complaint description; physical dimensions and exact severity require field verification.');
  }

  let overallScore = computeWeightedScore(urgency, safetyImpact, peopleAffected, recurrence);
  let safetyOverride = false;
  let safetyOverrideReason: string | null = null;

  const allowOverride = input.enableSafetyOverride !== false;
  if (allowOverride && matchedHazards.length > 0 && overallScore < 3.6) {
    safetyOverride = true;
    overallScore = 3.85;
    safetyOverrideReason = `Escalated to Critical (3.85/5.00) under life-safety hazard override rule triggered by: ${matchedHazards.join(', ')}. Note: CivicPulse AI is a municipal triage tool, not an emergency-response dispatch service.`;
  } else if (allowOverride && matchedHazards.length > 0) {
    safetyOverride = true;
    safetyOverrideReason = `Life-safety hazard flag active (${matchedHazards.join(', ')}). Score (${overallScore.toFixed(2)}/5.00) already meets Critical threshold.`;
  }

  const priorityLevel = scoreToPriorityLevel(overallScore);

  const formulaDisplay = `0.35×${urgency.toFixed(1)} (Urgency) + 0.35×${safetyImpact.toFixed(1)} (Safety) + 0.20×${peopleAffected.toFixed(1)} (People) + 0.10×${recurrence.toFixed(1)} (Recurrence) = ${overallScore.toFixed(2)} / 5.00`;

  let suggestedAction = 'Schedule standard municipal inspection within 5–7 business days.';
  if (priorityLevel === 'Critical') {
    suggestedAction =
      'Dispatch rapid-response field crew immediately to barricade/secure hazard and verify duplicate reports on site.';
  } else if (priorityLevel === 'High') {
    suggestedAction =
      'Assign specialized maintenance team within 24 hours and inspect surrounding cluster for related infrastructure impact.';
  } else if (priorityLevel === 'Medium') {
    suggestedAction =
      'Queue for routine ward maintenance inspection within 48–72 hours and verify category assignment.';
  }

  const explanationParts = [
    `Priority ${priorityLevel} (${overallScore.toFixed(2)}/5.00) calculated via weighted formula [${formulaDisplay}].`,
  ];
  if (safetyOverrideReason) {
    explanationParts.push(safetyOverrideReason);
  }
  explanationParts.push(`Recommended Action: ${suggestedAction}`);

  return {
    overall_score: overallScore,
    priority_level: priorityLevel,
    factors: {
      urgency,
      safety_impact: safetyImpact,
      people_affected: peopleAffected,
      recurrence,
    },
    formula_display: formulaDisplay,
    explanation: explanationParts.join(' '),
    assumptions,
    missing_info: missingInfo,
    safety_override: safetyOverride,
    safety_override_reason: safetyOverrideReason,
    suggested_action: suggestedAction,
    method: 'weighted-deterministic-v1',
  };
}
