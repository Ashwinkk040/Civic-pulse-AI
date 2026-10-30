export type ComplaintCategory =
  | 'Road Damage'
  | 'Waterlogging'
  | 'Waste Management'
  | 'Drainage'
  | 'Streetlight'
  | 'Public Safety'
  | 'Other';

export const SUPPORTED_CATEGORIES: ComplaintCategory[] = [
  'Road Damage',
  'Waterlogging',
  'Waste Management',
  'Drainage',
  'Streetlight',
  'Public Safety',
  'Other',
];

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type ComplaintStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Reopened';

export const WORKFLOW_STATUSES: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Reopened',
];

export const MUNICIPAL_TEAMS = [
  'Roads & Civil Maintenance Unit',
  'Stormwater & Drainage Operations',
  'Sanitation & Solid Waste Rapid Response',
  'Electrical & Streetlight Grid Team',
  'Public Safety & Hazard Mitigation Squad',
  'General Municipal Field Inspection',
] as const;

export interface DuplicateCandidate {
  candidate_id: number;
  candidate_public_id: string;
  similarity_score: number;
  distance_meters: number | null;
  category: string;
  location_name: string;
  summary: string;
  status: ComplaintStatus;
  created_at: string;
  reason: string;
  method: string;
}

export interface PriorityBreakdown {
  overall_score: number;
  priority_level: PriorityLevel;
  factors: {
    urgency: number;
    safety_impact: number;
    people_affected: number;
    recurrence: number;
  };
  formula_display: string;
  explanation: string;
  assumptions: string[];
  missing_info: string[];
  safety_override: boolean;
  safety_override_reason: string | null;
  suggested_action: string;
  method: string;
}

export interface StatusHistoryEntry {
  id: number;
  complaint_id: number;
  previous_status: ComplaintStatus | null;
  new_status: ComplaintStatus;
  timestamp: string;
  actor: string;
  public_message: string;
}

export interface Complaint {
  id: number;
  public_id: string;
  description: string;
  citizen_category: string | null;
  category: ComplaintCategory;
  predicted_category: ComplaintCategory;
  category_confidence: number;
  category_method: string;
  needs_review: boolean;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  summary: string;
  summary_method: string;
  priority_score: number;
  priority_level: PriorityLevel;
  priority_reason: string;
  priority_breakdown: PriorityBreakdown;
  urgency_score: number;
  safety_score: number;
  affected_score: number;
  recurrence_score: number;
  safety_override: boolean;
  status: ComplaintStatus;
  assigned_team: string | null;
  duplicate_of_id: number | null;
  duplicate_of_public_id?: string | null;
  duplicate_status: 'unverified' | 'potential' | 'confirmed' | 'rejected';
  duplicate_confidence: number | null;
  duplicate_reason: string | null;
  duplicate_candidates: DuplicateCandidate[];
  recommended_action: string;
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  image_filename: string | null;
  history?: StatusHistoryEntry[];
  related_complaints?: Array<{
    id: number;
    public_id: string;
    category: string;
    location_name: string;
    priority_level: PriorityLevel;
    status: ComplaintStatus;
    summary: string;
  }>;
}

export interface HotspotCluster {
  cluster_id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  report_count: number;
  primary_area: string;
  categories: Record<string, number>;
  priorities: Record<PriorityLevel, number>;
  highest_priority: PriorityLevel;
  avg_priority_score: number;
  is_multi_problem: boolean;
  unresolved_count: number;
  complaint_ids: string[];
  explanation: string;
  recommended_action: string;
  distinction_note: string;
}

export interface AnalyticsSummary {
  total_complaints: number;
  unresolved_complaints: number;
  critical_complaints: number;
  resolved_complaints: number;
  possible_duplicates: number;
  confirmed_duplicates: number;
  needs_review_count: number;
  synthetic_count: number;
  with_coordinates_count: number;
  missing_coordinates_count: number;
  category_distribution: Record<string, number>;
  priority_distribution: Record<PriorityLevel, number>;
  status_distribution: Record<ComplaintStatus, number>;
  trend_by_day: Array<{ date: string; count: number; resolved: number }>;
}

export interface ActionBrief {
  generated_at: string;
  method: string;
  headline: string;
  narrative: string;
  key_observations: string[];
  recommendations: string[];
  disclaimer: string;
  stats_snapshot: {
    total: number;
    unresolved: number;
    critical_open: number;
    hotspot_count: number;
    pending_duplicates: number;
  };
}
