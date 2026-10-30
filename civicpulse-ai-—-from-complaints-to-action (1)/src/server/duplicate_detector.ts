import { ComplaintCategory, ComplaintStatus, DuplicateCandidate } from '../shared/types.ts';
import { normalizeText } from './ai_engine.ts';

export interface ExistingComplaintRecord {
  id: number;
  public_id: string;
  description: string;
  category: ComplaintCategory;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  summary: string;
  status: ComplaintStatus;
  created_at: string;
}

export interface DuplicateTargetInput {
  id?: number | null;
  description: string;
  category: ComplaintCategory;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'near',
  'from',
  'that',
  'this',
  'there',
  'have',
  'been',
  'has',
  'are',
  'was',
  'were',
  'very',
  'please',
  'fix',
  'issue',
  'problem',
  'complaint',
  'report',
  'reported',
  'area',
  'road',
  'street',
  'since',
  'days',
]);

const COMPATIBLE_CATEGORIES: Record<ComplaintCategory, Set<ComplaintCategory>> = {
  'Road Damage': new Set(['Road Damage', 'Public Safety', 'Waterlogging']),
  Waterlogging: new Set(['Waterlogging', 'Drainage', 'Road Damage']),
  Drainage: new Set(['Drainage', 'Waterlogging', 'Waste Management', 'Public Safety']),
  'Waste Management': new Set(['Waste Management', 'Drainage']),
  Streetlight: new Set(['Streetlight', 'Public Safety']),
  'Public Safety': new Set(['Public Safety', 'Road Damage', 'Drainage', 'Streetlight']),
  Other: new Set(['Other', 'Road Damage', 'Waterlogging', 'Waste Management', 'Drainage', 'Streetlight', 'Public Safety']),
};

/**
 * Calculates Haversine distance in meters between two geographic points.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function extractTokens(text: string): string[] {
  const norm = normalizeText(text).replace(/[^a-z0-9\s]/g, ' ');
  return norm
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

export function computeLexicalSimilarity(textA: string, textB: string): number {
  const tokensA = extractTokens(textA);
  const tokensB = extractTokens(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Build term frequency vectors (unigrams + character 4-grams for morphological resilience)
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();

  for (const t of tokensA) {
    freqA.set(t, (freqA.get(t) || 0) + 1.2);
    if (t.length >= 5) {
      const stem = t.slice(0, 5);
      freqA.set(`stem:${stem}`, (freqA.get(`stem:${stem}`) || 0) + 0.6);
    }
  }
  for (const t of tokensB) {
    freqB.set(t, (freqB.get(t) || 0) + 1.2);
    if (t.length >= 5) {
      const stem = t.slice(0, 5);
      freqB.set(`stem:${stem}`, (freqB.get(`stem:${stem}`) || 0) + 0.6);
    }
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of freqA.entries()) {
    normA += valA * valA;
    const valB = freqB.get(key) || 0;
    dotProduct += valA * valB;
  }
  for (const valB of freqB.values()) {
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeLocationNameSimilarity(locA: string, locB: string): number {
  if (!locA || !locB) return 0;
  const normA = normalizeText(locA);
  const normB = normalizeText(locB);
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;
  return computeLexicalSimilarity(locA, locB);
}

/**
 * Detects ranked duplicate candidates from recent complaints.
 * Prevents comparing a report against itself and prevents false positives when locations are distant.
 */
export function detectDuplicateCandidates(
  target: DuplicateTargetInput,
  existingRecords: ExistingComplaintRecord[],
  options: { maxCandidates?: number; threshold?: number; maxDistanceMeters?: number } = {}
): DuplicateCandidate[] {
  const maxCandidates = options.maxCandidates ?? 5;
  const threshold = options.threshold ?? 0.56;
  const maxDistanceMeters = options.maxDistanceMeters ?? 850; // Reports >850m apart are distinct locations

  const targetHasCoords =
    typeof target.latitude === 'number' &&
    !Number.isNaN(target.latitude) &&
    typeof target.longitude === 'number' &&
    !Number.isNaN(target.longitude);

  // Pre-limit candidate pool to most recent 150 records for efficiency
  const pool = existingRecords.slice(0, 150);
  const results: DuplicateCandidate[] = [];

  for (const candidate of pool) {
    // 1. Never compare a report against itself
    if (target.id !== undefined && target.id !== null && candidate.id === target.id) {
      continue;
    }

    // 2. Check category compatibility
    const compatibleSet = COMPATIBLE_CATEGORIES[target.category] || COMPATIBLE_CATEGORIES.Other;
    const exactCategoryMatch = target.category === candidate.category;
    const isCategoryCompatible = exactCategoryMatch || compatibleSet.has(candidate.category);
    if (!isCategoryCompatible) {
      continue;
    }

    // 3. Calculate geographic distance if both have coordinates
    const candHasCoords =
      typeof candidate.latitude === 'number' &&
      !Number.isNaN(candidate.latitude) &&
      typeof candidate.longitude === 'number' &&
      !Number.isNaN(candidate.longitude);

    let distanceMeters: number | null = null;
    if (targetHasCoords && candHasCoords) {
      distanceMeters = Math.round(
        haversineDistanceMeters(
          target.latitude as number,
          target.longitude as number,
          candidate.latitude as number,
          candidate.longitude as number
        )
      );

      // False-positive guard: if both have verified coordinates and are far apart, they are NOT the same incident
      if (distanceMeters > maxDistanceMeters) {
        continue;
      }
    }

    // 4. Compute text and location name similarity
    const textSim = computeLexicalSimilarity(target.description, candidate.description);
    const locSim = computeLocationNameSimilarity(target.location_name, candidate.location_name);

    // False-positive guard when coordinates are missing on one or both reports:
    // Require strong location name agreement if coordinates cannot verify proximity
    if (distanceMeters === null && locSim < 0.35) {
      continue;
    }

    // Even when coordinates are missing and text is similar, if location names clearly name different wards/sectors, skip
    let geoScore = 0;
    if (distanceMeters !== null) {
      if (distanceMeters <= 120) geoScore = 1.0;
      else if (distanceMeters <= 300) geoScore = 0.85;
      else if (distanceMeters <= 550) geoScore = 0.65;
      else geoScore = Math.max(0.2, 1 - distanceMeters / maxDistanceMeters);
    } else {
      geoScore = locSim * 0.85;
    }

    const catScore = exactCategoryMatch ? 1.0 : 0.6;

    // Combined weighted similarity score
    const combinedScore = Number(
      (0.50 * textSim + 0.35 * geoScore + 0.15 * catScore).toFixed(2)
    );

    // Require minimum text similarity so two completely unrelated issues at the same corner aren't marked duplicates
    if (textSim < 0.25 || combinedScore < threshold) {
      continue;
    }

    const reasons: string[] = [];
    if (exactCategoryMatch) {
      reasons.push(`Same category (${candidate.category})`);
    } else {
      reasons.push(`Related category (${candidate.category})`);
    }

    if (distanceMeters !== null) {
      reasons.push(`${distanceMeters}m away`);
    } else if (locSim >= 0.5) {
      reasons.push(`Matching location area ("${candidate.location_name}")`);
    }

    reasons.push(`Text similarity ${Math.round(textSim * 100)}% (lexical-stem overlap)`);

    results.push({
      candidate_id: candidate.id,
      candidate_public_id: candidate.public_id,
      similarity_score: combinedScore,
      distance_meters: distanceMeters,
      category: candidate.category,
      location_name: candidate.location_name,
      summary: candidate.summary,
      status: candidate.status,
      created_at: candidate.created_at,
      reason: `${reasons.join(' · ')}. Requires officer verification before linking.`,
      method: 'lexical-geo-hybrid-fallback',
    });
  }

  return results
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, maxCandidates);
}
