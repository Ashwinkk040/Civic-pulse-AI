import crypto from 'crypto';
import {
  AnalyticsSummary,
  Complaint,
  ComplaintCategory,
  ComplaintStatus,
  DuplicateCandidate,
  PriorityBreakdown,
  PriorityLevel,
  StatusHistoryEntry,
  SUPPORTED_CATEGORIES,
  WORKFLOW_STATUSES,
} from '../shared/types.ts';
import { isValidCategory, processComplaintTextAI } from './ai_engine.ts';
import { getDb } from './database.ts';
import {
  detectDuplicateCandidates,
  ExistingComplaintRecord,
  haversineDistanceMeters,
} from './duplicate_detector.ts';
import { calculateExplainablePriority } from './priority_engine.ts';

export const ALLOWED_STATUS_TRANSITIONS: Record<ComplaintStatus, Set<ComplaintStatus>> = {
  Submitted: new Set(['Under Review', 'Assigned', 'In Progress']),
  'Under Review': new Set(['Assigned', 'In Progress', 'Resolved']),
  Assigned: new Set(['In Progress', 'Under Review', 'Resolved']),
  'In Progress': new Set(['Resolved', 'Assigned', 'Under Review']),
  Resolved: new Set(['Reopened']),
  Reopened: new Set(['Under Review', 'Assigned', 'In Progress', 'Resolved']),
};

export function isValidStatusTransition(
  currentStatus: ComplaintStatus,
  nextStatus: ComplaintStatus
): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function generateUniquePublicId(): string {
  const db = getDb();
  for (let attempt = 0; attempt < 15; attempt++) {
    const token = crypto.randomBytes(3).toString('hex').toUpperCase();
    const candidate = `CP-2026-${token}`;
    const exists = db
      .prepare('SELECT id FROM complaints WHERE public_id = ?')
      .get(candidate);
    if (!exists) {
      return candidate;
    }
  }
  return `CP-2026-${Date.now().toString(36).toUpperCase()}`;
}

export interface CreateComplaintInput {
  public_id?: string;
  description: string;
  citizen_category?: string | null;
  location_name: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  image_data_url?: string | null;
  status?: ComplaintStatus;
  assigned_team?: string | null;
  created_at?: string;
  resolved_at?: string | null;
  is_synthetic?: boolean;
  enableExternalAI?: boolean;
}

export function validateCoordinates(
  latRaw?: number | string | null,
  lngRaw?: number | string | null
): { latitude: number | null; longitude: number | null; error?: string } {
  const hasLat = latRaw !== undefined && latRaw !== null && String(latRaw).trim() !== '';
  const hasLng = lngRaw !== undefined && lngRaw !== null && String(lngRaw).trim() !== '';

  if (!hasLat && !hasLng) {
    return { latitude: null, longitude: null };
  }
  if (hasLat !== hasLng) {
    return {
      latitude: null,
      longitude: null,
      error: 'Both latitude and longitude must be provided together, or both left blank.',
    };
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (Number.isNaN(lat) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return {
      latitude: null,
      longitude: null,
      error: 'Latitude must be a valid number between -90 and 90.',
    };
  }
  if (Number.isNaN(lng) || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return {
      latitude: null,
      longitude: null,
      error: 'Longitude must be a valid number between -180 and 180.',
    };
  }

  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
  };
}

export function validateImageUpload(imageDataUrl?: string | null): {
  valid: boolean;
  sanitizedRef: string | null;
  error?: string;
} {
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) {
    return { valid: true, sanitizedRef: null };
  }

  const trimmed = imageDataUrl.trim();
  const allowedPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,',
    'data:image/webp;base64,',
  ];

  const isAllowedDataUri = allowedPrefixes.some((p) => trimmed.startsWith(p));
  if (!isAllowedDataUri) {
    return {
      valid: false,
      sanitizedRef: null,
      error: 'Invalid image format. Only JPEG, PNG, and WebP images are permitted.',
    };
  }

  // Max ~3.5MB base64 payload
  if (trimmed.length > 4_800_000) {
    return {
      valid: false,
      sanitizedRef: null,
      error: 'Uploaded image exceeds the maximum allowed size of 3.5 MB.',
    };
  }

  return { valid: true, sanitizedRef: trimmed };
}

function mapRowToComplaint(row: any): Complaint {
  let priorityBreakdown: PriorityBreakdown;
  try {
    priorityBreakdown = JSON.parse(row.priority_breakdown_json);
  } catch {
    priorityBreakdown = {
      overall_score: row.priority_score,
      priority_level: row.priority_level,
      factors: {
        urgency: row.urgency_score,
        safety_impact: row.safety_score,
        people_affected: row.affected_score,
        recurrence: row.recurrence_score,
      },
      formula_display: '',
      explanation: row.priority_reason,
      assumptions: [],
      missing_info: [],
      safety_override: Boolean(row.safety_override),
      safety_override_reason: null,
      suggested_action: row.recommended_action,
      method: 'weighted-deterministic-v1',
    };
  }

  let duplicateCandidates: DuplicateCandidate[] = [];
  try {
    duplicateCandidates = JSON.parse(row.duplicate_candidates_json || '[]');
  } catch {
    duplicateCandidates = [];
  }

  return {
    id: row.id,
    public_id: row.public_id,
    description: row.description,
    citizen_category: row.citizen_category,
    category: row.category as ComplaintCategory,
    predicted_category: row.predicted_category as ComplaintCategory,
    category_confidence: row.category_confidence,
    category_method: row.category_method,
    needs_review: Boolean(row.needs_review),
    location_name: row.location_name,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    summary: row.summary,
    summary_method: row.summary_method,
    priority_score: Number(row.priority_score),
    priority_level: row.priority_level as PriorityLevel,
    priority_reason: row.priority_reason,
    priority_breakdown: priorityBreakdown,
    urgency_score: Number(row.urgency_score),
    safety_score: Number(row.safety_score),
    affected_score: Number(row.affected_score),
    recurrence_score: Number(row.recurrence_score),
    safety_override: Boolean(row.safety_override),
    status: row.status as ComplaintStatus,
    assigned_team: row.assigned_team || null,
    duplicate_of_id: row.duplicate_of_id || null,
    duplicate_of_public_id: row.duplicate_of_public_id || null,
    duplicate_status: row.duplicate_status || 'unverified',
    duplicate_confidence:
      row.duplicate_confidence !== null && row.duplicate_confidence !== undefined
        ? Number(row.duplicate_confidence)
        : null,
    duplicate_reason: row.duplicate_reason || null,
    duplicate_candidates: duplicateCandidates,
    recommended_action: row.recommended_action,
    is_synthetic: Boolean(row.is_synthetic),
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at || null,
    image_filename: row.image_filename || null,
  };
}

export async function createComplaint(input: CreateComplaintInput): Promise<Complaint> {
  const description = (input.description || '').trim();
  if (!description || description.length < 8) {
    throw new Error('Complaint description is required and must be at least 8 characters long.');
  }
  if (description.length > 3000) {
    throw new Error('Complaint description must not exceed 3,000 characters.');
  }

  const locationName = (input.location_name || '').trim();
  if (!locationName || locationName.length < 3) {
    throw new Error('Location or area name is required (at least 3 characters).');
  }

  const coordCheck = validateCoordinates(input.latitude, input.longitude);
  if (coordCheck.error) {
    throw new Error(coordCheck.error);
  }

  const imgCheck = validateImageUpload(input.image_data_url);
  if (!imgCheck.valid) {
    throw new Error(imgCheck.error || 'Invalid image upload.');
  }

  const db = getDb();

  // Prevent accidental rapid duplicate click submissions (same description + location within 45 seconds)
  if (!input.is_synthetic) {
    const recentIdentical = db
      .prepare(
        `SELECT public_id, created_at FROM complaints
         WHERE LOWER(TRIM(description)) = LOWER(TRIM(?))
           AND LOWER(TRIM(location_name)) = LOWER(TRIM(?))
         ORDER BY id DESC LIMIT 1`
      )
      .get(description, locationName) as { public_id: string; created_at: string } | undefined;

    if (recentIdentical) {
      const elapsedMs = Date.now() - new Date(recentIdentical.created_at).getTime();
      if (elapsedMs >= 0 && elapsedMs < 30_000) {
        throw new Error(
          `Duplicate submission prevented: an identical complaint was just submitted (${recentIdentical.public_id}).`
        );
      }
    }
  }

  // 1. Run AI categorization and summarization
  const { categorization, summarization } = await processComplaintTextAI(
    description,
    locationName,
    input.citizen_category,
    input.enableExternalAI !== false
  );

  // 2. Load recent existing complaints for duplicate detection & recurrence calculation
  const existingRows = db
    .prepare(
      `SELECT id, public_id, description, category, location_name, latitude, longitude, summary, status, created_at
       FROM complaints
       ORDER BY id DESC LIMIT 150`
    )
    .all() as ExistingComplaintRecord[];

  const duplicateCandidates = detectDuplicateCandidates(
    {
      description,
      category: categorization.final_category,
      location_name: locationName,
      latitude: coordCheck.latitude,
      longitude: coordCheck.longitude,
    },
    existingRows
  );

  // Count historical nearby reports for recurrence factor
  let historicalNearbyCount = 0;
  for (const row of existingRows) {
    if (
      coordCheck.latitude !== null &&
      coordCheck.longitude !== null &&
      row.latitude !== null &&
      row.longitude !== null
    ) {
      const dist = haversineDistanceMeters(
        coordCheck.latitude,
        coordCheck.longitude,
        row.latitude,
        row.longitude
      );
      if (dist <= 450 && row.category === categorization.final_category) {
        historicalNearbyCount++;
      }
    } else if (
      row.location_name.toLowerCase().includes(locationName.toLowerCase().split(',')[0].trim()) &&
      row.category === categorization.final_category
    ) {
      historicalNearbyCount++;
    }
  }

  // 3. Calculate explainable priority
  const priorityBreakdown = calculateExplainablePriority({
    description,
    category: categorization.final_category,
    locationName,
    latitude: coordCheck.latitude,
    longitude: coordCheck.longitude,
    historicalNearbyCount,
  });

  const topCandidate = duplicateCandidates[0] || null;
  const duplicateStatus = topCandidate ? 'potential' : 'unverified';
  const duplicateOfId = topCandidate ? topCandidate.candidate_id : null;
  const duplicateConfidence = topCandidate ? topCandidate.similarity_score : null;
  const duplicateReason = topCandidate ? topCandidate.reason : null;

  const publicId = input.public_id || generateUniquePublicId();
  const nowIso = input.created_at || new Date().toISOString();
  const status: ComplaintStatus = input.status || 'Submitted';
  const resolvedAt =
    status === 'Resolved' ? input.resolved_at || nowIso : null;

  const insertTx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO complaints (
          public_id, description, citizen_category, category, predicted_category,
          category_confidence, category_method, needs_review, location_name,
          latitude, longitude, summary, summary_method, priority_score,
          priority_level, priority_reason, priority_breakdown_json,
          urgency_score, safety_score, affected_score, recurrence_score,
          safety_override, status, assigned_team, duplicate_of_id,
          duplicate_status, duplicate_confidence, duplicate_reason,
          duplicate_candidates_json, recommended_action, is_synthetic,
          created_at, updated_at, resolved_at, image_filename
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?
        )`
      )
      .run(
        publicId,
        description,
        categorization.citizen_category,
        categorization.final_category,
        categorization.predicted_category,
        categorization.confidence,
        categorization.method,
        categorization.needs_review ? 1 : 0,
        locationName,
        coordCheck.latitude,
        coordCheck.longitude,
        summarization.summary,
        summarization.method,
        priorityBreakdown.overall_score,
        priorityBreakdown.priority_level,
        priorityBreakdown.explanation,
        JSON.stringify(priorityBreakdown),
        priorityBreakdown.factors.urgency,
        priorityBreakdown.factors.safety_impact,
        priorityBreakdown.factors.people_affected,
        priorityBreakdown.factors.recurrence,
        priorityBreakdown.safety_override ? 1 : 0,
        status,
        input.assigned_team || null,
        duplicateOfId,
        duplicateStatus,
        duplicateConfidence,
        duplicateReason,
        JSON.stringify(duplicateCandidates),
        priorityBreakdown.suggested_action,
        input.is_synthetic ? 1 : 0,
        nowIso,
        nowIso,
        resolvedAt,
        imgCheck.sanitizedRef
      );

    const complaintId = Number(result.lastInsertRowid);

    // Record initial status history entry
    db.prepare(
      `INSERT INTO complaint_status_history (
        complaint_id, previous_status, new_status, timestamp, actor, public_message
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      complaintId,
      null,
      'Submitted',
      nowIso,
      'Citizen Portal',
      `Complaint received and assigned tracking ID ${publicId}. Automated triage classified as ${categorization.final_category} (${priorityBreakdown.priority_level} Priority).`
    );

    if (status !== 'Submitted') {
      db.prepare(
        `INSERT INTO complaint_status_history (
          complaint_id, previous_status, new_status, timestamp, actor, public_message
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        complaintId,
        'Submitted',
        status,
        resolvedAt || nowIso,
        input.assigned_team || 'Municipal Operations Control',
        status === 'Resolved'
          ? `Issue resolved and verified by ${input.assigned_team || 'Municipal Field Team'}.`
          : `Status updated to ${status}${input.assigned_team ? ` and assigned to ${input.assigned_team}` : ''}.`
      );
    }

    return complaintId;
  });

  const newId = insertTx();
  const created = getComplaintById(newId);
  if (!created) {
    throw new Error('Failed to retrieve complaint after insertion.');
  }
  return created;
}

export interface ComplaintFilterOptions {
  search?: string;
  category?: string;
  priority_level?: string;
  status?: string;
  location?: string;
  duplicate_only?: boolean;
  sort_by?: 'priority_desc' | 'priority_asc' | 'newest' | 'oldest';
  limit?: number;
}

export function listComplaints(filters: ComplaintFilterOptions = {}): Complaint[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      `(LOWER(c.public_id) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(c.location_name) LIKE ? OR LOWER(c.summary) LIKE ?)`
    );
    params.push(q, q, q, q);
  }

  if (filters.category && filters.category !== 'All') {
    conditions.push(`c.category = ?`);
    params.push(filters.category);
  }

  if (filters.priority_level && filters.priority_level !== 'All') {
    conditions.push(`c.priority_level = ?`);
    params.push(filters.priority_level);
  }

  if (filters.status && filters.status !== 'All') {
    if (filters.status === 'Unresolved') {
      conditions.push(`c.status != 'Resolved'`);
    } else {
      conditions.push(`c.status = ?`);
      params.push(filters.status);
    }
  }

  if (filters.location && filters.location.trim() && filters.location !== 'All') {
    conditions.push(`LOWER(c.location_name) LIKE ?`);
    params.push(`%${filters.location.trim().toLowerCase()}%`);
  }

  if (filters.duplicate_only) {
    conditions.push(`c.duplicate_status IN ('potential', 'confirmed')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderClause = 'ORDER BY c.priority_score DESC, c.created_at DESC';
  if (filters.sort_by === 'priority_asc') {
    orderClause = 'ORDER BY c.priority_score ASC, c.created_at DESC';
  } else if (filters.sort_by === 'newest') {
    orderClause = 'ORDER BY c.created_at DESC, c.id DESC';
  } else if (filters.sort_by === 'oldest') {
    orderClause = 'ORDER BY c.created_at ASC, c.id ASC';
  }

  const limit = Math.min(500, Math.max(1, filters.limit ?? 200));

  const rows = db
    .prepare(
      `SELECT c.*, p.public_id AS duplicate_of_public_id
       FROM complaints c
       LEFT JOIN complaints p ON c.duplicate_of_id = p.id
       ${whereClause}
       ${orderClause}
       LIMIT ?`
    )
    .all(...params, limit);

  return rows.map(mapRowToComplaint);
}

export function getComplaintById(id: number): Complaint | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*, p.public_id AS duplicate_of_public_id
       FROM complaints c
       LEFT JOIN complaints p ON c.duplicate_of_id = p.id
       WHERE c.id = ?`
    )
    .get(id);

  if (!row) return null;
  return enrichComplaintWithHistoryAndRelated(mapRowToComplaint(row));
}

export function getComplaintByPublicId(publicId: string): Complaint | null {
  if (!publicId || typeof publicId !== 'string') return null;
  const db = getDb();
  const normalizedId = publicId.trim().toUpperCase();
  const row = db
    .prepare(
      `SELECT c.*, p.public_id AS duplicate_of_public_id
       FROM complaints c
       LEFT JOIN complaints p ON c.duplicate_of_id = p.id
       WHERE UPPER(c.public_id) = ?`
    )
    .get(normalizedId);

  if (!row) return null;
  return enrichComplaintWithHistoryAndRelated(mapRowToComplaint(row));
}

function enrichComplaintWithHistoryAndRelated(complaint: Complaint): Complaint {
  const db = getDb();
  const historyRows = db
    .prepare(
      `SELECT id, complaint_id, previous_status, new_status, timestamp, actor, public_message
       FROM complaint_status_history
       WHERE complaint_id = ?
       ORDER BY timestamp ASC, id ASC`
    )
    .all(complaint.id) as StatusHistoryEntry[];

  const areaPrefix = (complaint.location_name || '').split(',')[0].trim();
  const relatedRows = db
    .prepare(
      `SELECT id, public_id, category, location_name, priority_level, status, summary
       FROM complaints
       WHERE id != ?
         AND (category = ? OR LOWER(location_name) LIKE ?)
       ORDER BY priority_score DESC, created_at DESC
       LIMIT 5`
    )
    .all(complaint.id, complaint.category, `%${areaPrefix.toLowerCase()}%`) as Array<{
    id: number;
    public_id: string;
    category: string;
    location_name: string;
    priority_level: PriorityLevel;
    status: ComplaintStatus;
    summary: string;
  }>;

  return {
    ...complaint,
    history: historyRows,
    related_complaints: relatedRows,
  };
}

export function assignComplaintTeam(
  id: number,
  team: string,
  actor: string = 'Municipal Operations Officer',
  publicMessage?: string
): Complaint {
  const trimmedTeam = (team || '').trim();
  if (!trimmedTeam) {
    throw new Error('Assigned team name is required.');
  }

  const db = getDb();
  const current = getComplaintById(id);
  if (!current) {
    throw new Error(`Complaint with ID ${id} not found.`);
  }

  const nowIso = new Date().toISOString();
  const nextStatus: ComplaintStatus =
    current.status === 'Submitted' || current.status === 'Under Review'
      ? 'Assigned'
      : current.status;

  const msg =
    publicMessage?.trim() ||
    `Assigned to ${trimmedTeam} for field inspection and resolution.`;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE complaints
       SET assigned_team = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(trimmedTeam, nextStatus, nowIso, id);

    db.prepare(
      `INSERT INTO complaint_status_history (
        complaint_id, previous_status, new_status, timestamp, actor, public_message
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, current.status, nextStatus, nowIso, `${actor} (${trimmedTeam})`, msg);
  });

  tx();
  return getComplaintById(id)!;
}

export function updateComplaintStatus(
  id: number,
  newStatusRaw: string,
  actor: string = 'Municipal Operations Officer',
  publicMessage?: string,
  categoryOverride?: string
): Complaint {
  if (!(WORKFLOW_STATUSES as string[]).includes(newStatusRaw)) {
    throw new Error(`Invalid status "${newStatusRaw}". Allowed statuses: ${WORKFLOW_STATUSES.join(', ')}.`);
  }

  const nextStatus = newStatusRaw as ComplaintStatus;
  const db = getDb();
  const current = getComplaintById(id);
  if (!current) {
    throw new Error(`Complaint with ID ${id} not found.`);
  }

  if (!isValidStatusTransition(current.status, nextStatus)) {
    throw new Error(
      `Invalid status transition from "${current.status}" to "${nextStatus}". Allowed transitions from "${current.status}": ${Array.from(
        ALLOWED_STATUS_TRANSITIONS[current.status] || []
      ).join(', ')}.`
    );
  }

  const nowIso = new Date().toISOString();
  const resolvedAt =
    nextStatus === 'Resolved'
      ? nowIso
      : nextStatus === 'Reopened'
      ? null
      : current.resolved_at;

  const updatedCategory =
    categoryOverride && isValidCategory(categoryOverride)
      ? categoryOverride
      : current.category;

  const defaultMessages: Record<ComplaintStatus, string> = {
    Submitted: 'Complaint submitted and logged.',
    'Under Review': 'Complaint is under review by municipal operations triage.',
    Assigned: `Complaint assigned to ${current.assigned_team || 'field maintenance crew'}.`,
    'In Progress': `Field work is actively in progress by ${current.assigned_team || 'municipal technicians'}.`,
    Resolved: `Issue has been resolved and verified by ${current.assigned_team || 'municipal operations'}.`,
    Reopened: 'Complaint has been reopened for follow-up inspection.',
  };

  const msg = publicMessage?.trim() || defaultMessages[nextStatus];

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE complaints
       SET status = ?, category = ?, needs_review = 0, updated_at = ?, resolved_at = ?
       WHERE id = ?`
    ).run(nextStatus, updatedCategory, nowIso, resolvedAt, id);

    db.prepare(
      `INSERT INTO complaint_status_history (
        complaint_id, previous_status, new_status, timestamp, actor, public_message
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, current.status, nextStatus, nowIso, actor, msg);
  });

  tx();
  return getComplaintById(id)!;
}

export function reviewDuplicateRelationship(
  id: number,
  action: 'confirm' | 'reject',
  targetDuplicateId?: number | null,
  actor: string = 'Municipal Operations Officer'
): Complaint {
  const db = getDb();
  const current = getComplaintById(id);
  if (!current) {
    throw new Error(`Complaint with ID ${id} not found.`);
  }

  const nowIso = new Date().toISOString();

  if (action === 'confirm') {
    const linkedId = targetDuplicateId || current.duplicate_of_id || current.duplicate_candidates[0]?.candidate_id;
    if (!linkedId || linkedId === id) {
      throw new Error('A valid distinct parent complaint ID is required to confirm a duplicate relationship.');
    }
    const parent = getComplaintById(linkedId);
    if (!parent) {
      throw new Error(`Referenced complaint ID ${linkedId} does not exist.`);
    }

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE complaints
         SET duplicate_of_id = ?, duplicate_status = 'confirmed', updated_at = ?
         WHERE id = ?`
      ).run(linkedId, nowIso, id);

      db.prepare(
        `INSERT INTO complaint_status_history (
          complaint_id, previous_status, new_status, timestamp, actor, public_message
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        current.status,
        current.status,
        nowIso,
        actor,
        `Linked as a confirmed duplicate of ${parent.public_id} (${parent.location_name}) for consolidated field action. Original report remains independently traceable.`
      );
    });
    tx();
  } else if (action === 'reject') {
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE complaints
         SET duplicate_of_id = NULL, duplicate_status = 'rejected', updated_at = ?
         WHERE id = ?`
      ).run(nowIso, id);

      db.prepare(
        `INSERT INTO complaint_status_history (
          complaint_id, previous_status, new_status, timestamp, actor, public_message
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        current.status,
        current.status,
        nowIso,
        actor,
        'Officer reviewed duplicate candidates and verified this report as an independent civic incident.'
      );
    });
    tx();
  } else {
    throw new Error('Invalid duplicate review action. Must be "confirm" or "reject".');
  }

  return getComplaintById(id)!;
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const db = getDb();
  const allRows = db
    .prepare(
      `SELECT category, priority_level, status, duplicate_status, needs_review, is_synthetic, latitude, longitude, created_at, resolved_at
       FROM complaints`
    )
    .all() as Array<{
    category: string;
    priority_level: PriorityLevel;
    status: ComplaintStatus;
    duplicate_status: string;
    needs_review: number;
    is_synthetic: number;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    resolved_at: string | null;
  }>;

  const categoryDistribution: Record<string, number> = {};
  for (const cat of SUPPORTED_CATEGORIES) {
    categoryDistribution[cat] = 0;
  }

  const priorityDistribution: Record<PriorityLevel, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };

  const statusDistribution: Record<ComplaintStatus, number> = {
    Submitted: 0,
    'Under Review': 0,
    Assigned: 0,
    'In Progress': 0,
    Resolved: 0,
    Reopened: 0,
  };

  let unresolved = 0;
  let critical = 0;
  let resolved = 0;
  let possibleDuplicates = 0;
  let confirmedDuplicates = 0;
  let needsReviewCount = 0;
  let syntheticCount = 0;
  let withCoords = 0;
  let missingCoords = 0;

  const trendMap = new Map<string, { count: number; resolved: number }>();

  for (const r of allRows) {
    categoryDistribution[r.category] = (categoryDistribution[r.category] || 0) + 1;
    if (priorityDistribution[r.priority_level] !== undefined) {
      priorityDistribution[r.priority_level]++;
    }
    if (statusDistribution[r.status] !== undefined) {
      statusDistribution[r.status]++;
    }

    if (r.status === 'Resolved') {
      resolved++;
    } else {
      unresolved++;
    }

    if (r.priority_level === 'Critical') {
      critical++;
    }

    if (r.duplicate_status === 'potential' || r.duplicate_status === 'confirmed') {
      possibleDuplicates++;
    }
    if (r.duplicate_status === 'confirmed') {
      confirmedDuplicates++;
    }
    if (r.needs_review) {
      needsReviewCount++;
    }
    if (r.is_synthetic) {
      syntheticCount++;
    }
    if (r.latitude !== null && r.longitude !== null) {
      withCoords++;
    } else {
      missingCoords++;
    }

    const dayKey = (r.created_at || '').slice(0, 10);
    if (dayKey) {
      const entry = trendMap.get(dayKey) || { count: 0, resolved: 0 };
      entry.count++;
      if (r.status === 'Resolved') {
        entry.resolved++;
      }
      trendMap.set(dayKey, entry);
    }
  }

  const trendByDay = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, vals]) => ({ date, count: vals.count, resolved: vals.resolved }));

  return {
    total_complaints: allRows.length,
    unresolved_complaints: unresolved,
    critical_complaints: critical,
    resolved_complaints: resolved,
    possible_duplicates: possibleDuplicates,
    confirmed_duplicates: confirmedDuplicates,
    needs_review_count: needsReviewCount,
    synthetic_count: syntheticCount,
    with_coordinates_count: withCoords,
    missing_coordinates_count: missingCoords,
    category_distribution: categoryDistribution,
    priority_distribution: priorityDistribution,
    status_distribution: statusDistribution,
    trend_by_day: trendByDay,
  };
}
