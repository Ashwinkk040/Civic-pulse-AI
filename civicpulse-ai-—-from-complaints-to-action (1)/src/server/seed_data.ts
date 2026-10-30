import { ComplaintCategory, ComplaintStatus } from '../shared/types.ts';
import { createComplaint } from './complaint_service.ts';
import { getDb, initDatabase } from './database.ts';

export interface SeedItem {
  public_id: string;
  description: string;
  citizen_category: ComplaintCategory;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  status: ComplaintStatus;
  assigned_team?: string | null;
  days_ago: number;
}

export const SYNTHETIC_SEED_DATA: SeedItem[] = [
  // --- CLUSTER 1: Central Market Junction (Multi-problem hotspot: Drainage, Waterlogging, Road Damage, Waste, Public Safety) ---
  {
    public_id: 'CP-2026-S001',
    description:
      'Severe blocked stormwater drain at Central Market Junction causing foul sewage overflow onto the main pedestrian walkway near the vegetable stalls.',
    citizen_category: 'Drainage',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9716,
    longitude: 77.5946,
    status: 'Under Review',
    days_ago: 6,
  },
  {
    public_id: 'CP-2026-S002',
    description:
      'Clogged drainage culvert at Central Market Junction overflowing dirty sewage water across the pedestrian footpath near the market stalls.',
    citizen_category: 'Drainage',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9718,
    longitude: 77.5948,
    status: 'Submitted',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S003',
    description:
      'Knee-deep waterlogging across Central Market Junction after afternoon rain; vehicles and buses are stranded and shops are flooding.',
    citizen_category: 'Waterlogging',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9720,
    longitude: 77.5945,
    status: 'Assigned',
    assigned_team: 'Stormwater & Drainage Operations',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S004',
    description:
      'Stagnant rainwater accumulation and flooding at Central Market Junction blocking two lanes of traffic near the bus stop.',
    citizen_category: 'Waterlogging',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9719,
    longitude: 77.5944,
    status: 'Submitted',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S005',
    description:
      'Deep pothole crater formed right after waterlogging at Central Market Junction; two-wheelers are swerving dangerously at the intersection.',
    citizen_category: 'Road Damage',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9714,
    longitude: 77.5949,
    status: 'In Progress',
    assigned_team: 'Roads & Civil Maintenance Unit',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S006',
    description:
      'Overflowing municipal garbage bins at Central Market Junction east gate; uncollected vegetable waste pile attracting stray animals and blocking drain grate.',
    citizen_category: 'Waste Management',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9722,
    longitude: 77.5951,
    status: 'Assigned',
    assigned_team: 'Sanitation & Solid Waste Rapid Response',
    days_ago: 3,
  },
  {
    public_id: 'CP-2026-S007',
    description:
      'Uncovered open manhole right outside Central Market Junction metro exit with no barricade; extreme hazard for pedestrians walking in knee-deep water.',
    citizen_category: 'Public Safety',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9715,
    longitude: 77.5943,
    status: 'Under Review',
    days_ago: 2,
  },
  {
    public_id: 'CP-2026-S008',
    description:
      'Missing manhole cover near Central Market Junction metro entrance; open manhole is completely unbarricaded and poses immediate danger to commuters.',
    citizen_category: 'Public Safety',
    location_name: 'Central Market Junction, Ward 4',
    latitude: 12.9716,
    longitude: 77.5942,
    status: 'Submitted',
    days_ago: 1,
  },

  // --- CLUSTER 2: Ward 12 School & Hospital Corridor (Critical Safety & Streetlight & Road Damage Hotspot) ---
  {
    public_id: 'CP-2026-S009',
    description:
      'Live exposed electrical wire hanging low from leaning utility pole directly outside City Public School gate in Ward 12; sparking during wind.',
    citizen_category: 'Public Safety',
    location_name: 'Civic School Road, Ward 12',
    latitude: 12.9852,
    longitude: 77.6052,
    status: 'In Progress',
    assigned_team: 'Public Safety & Hazard Mitigation Squad',
    days_ago: 2,
  },
  {
    public_id: 'CP-2026-S010',
    description:
      'Sparking transformer and low-hanging exposed wire near City Public School entrance on Civic School Road; urgent safety hazard for school children.',
    citizen_category: 'Public Safety',
    location_name: 'Civic School Road, Ward 12',
    latitude: 12.9854,
    longitude: 77.6054,
    status: 'Submitted',
    days_ago: 1,
  },
  {
    public_id: 'CP-2026-S011',
    description:
      'Entire row of six LED streetlights not working along Civic School Road and District Hospital pedestrian crossing; pitch dark at night.',
    citizen_category: 'Streetlight',
    location_name: 'Civic School Road, Ward 12',
    latitude: 12.9858,
    longitude: 77.6058,
    status: 'Assigned',
    assigned_team: 'Electrical & Streetlight Grid Team',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S012',
    description:
      'Streetlights completely out near District Hospital emergency entrance on Civic School Road; ambulances and pedestrians have zero visibility after 7 PM.',
    citizen_category: 'Streetlight',
    location_name: 'Civic School Road, Ward 12',
    latitude: 12.9860,
    longitude: 77.6060,
    status: 'Submitted',
    days_ago: 3,
  },
  {
    public_id: 'CP-2026-S013',
    description:
      'Damaged asphalt surface and deep potholes right outside District Hospital ambulance bay causing severe jolts to patient transport vehicles.',
    citizen_category: 'Road Damage',
    location_name: 'Civic School Road, Ward 12',
    latitude: 12.9849,
    longitude: 77.6048,
    status: 'Under Review',
    days_ago: 3,
  },
  {
    public_id: 'CP-2026-S014',
    description:
      'Unbarricaded open utility trench left across the footpath on Civic School Road near the pharmacy clinic.',
    citizen_category: 'Public Safety',
    location_name: 'Civic School Road, Ward 12',
    latitude: 12.9855,
    longitude: 77.6049,
    status: 'Submitted',
    days_ago: 1,
  },

  // --- CLUSTER 3: Tech Park Flyover & Ring Road Sector 9 (Road Damage & Waterlogging Hotspot) ---
  {
    public_id: 'CP-2026-S015',
    description:
      'Multiple large potholes on the up-ramp of Tech Park Flyover Sector 9 causing heavy morning traffic congestion and minor rear-end collisions.',
    citizen_category: 'Road Damage',
    location_name: 'Tech Park Flyover, Sector 9',
    latitude: 12.9352,
    longitude: 77.6245,
    status: 'Assigned',
    assigned_team: 'Roads & Civil Maintenance Unit',
    days_ago: 7,
  },
  {
    public_id: 'CP-2026-S016',
    description:
      'Deep pothole craters on Tech Park Flyover ascent ramp in Sector 9; broken asphalt exposing steel rebar and slowing down commuter buses.',
    citizen_category: 'Road Damage',
    location_name: 'Tech Park Flyover, Sector 9',
    latitude: 12.9354,
    longitude: 77.6247,
    status: 'Submitted',
    days_ago: 6,
  },
  {
    public_id: 'CP-2026-S017',
    description:
      'Severe waterlogging under the Tech Park Flyover service road in Sector 9 due to choked stormwater grates.',
    citizen_category: 'Waterlogging',
    location_name: 'Tech Park Flyover, Sector 9',
    latitude: 12.9348,
    longitude: 77.6241,
    status: 'In Progress',
    assigned_team: 'Stormwater & Drainage Operations',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S018',
    description:
      'Blocked drainage channel along Tech Park Flyover service lane in Sector 9; silt and plastic debris preventing rainwater runoff.',
    citizen_category: 'Drainage',
    location_name: 'Tech Park Flyover, Sector 9',
    latitude: 12.9350,
    longitude: 77.6243,
    status: 'Under Review',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S019',
    description:
      'Broken road divider and damaged guardrail on Tech Park Flyover curve in Sector 9.',
    citizen_category: 'Road Damage',
    location_name: 'Tech Park Flyover, Sector 9',
    latitude: 12.9356,
    longitude: 77.6250,
    status: 'Resolved',
    assigned_team: 'Roads & Civil Maintenance Unit',
    days_ago: 9,
  },

  // --- CLUSTER 4: Lakeview Residential Layout, Ward 7 (Waste Management & Drainage Hotspot) ---
  {
    public_id: 'CP-2026-S020',
    description:
      'Community garbage compactor station at Lakeview Layout 3rd Cross has not been cleared for four days; trash spilling onto the street.',
    citizen_category: 'Waste Management',
    location_name: 'Lakeview Layout, Ward 7',
    latitude: 12.9540,
    longitude: 77.5720,
    status: 'In Progress',
    assigned_team: 'Sanitation & Solid Waste Rapid Response',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S021',
    description:
      'Uncollected household garbage bags and overflowing dustbins piled up at Lakeview Layout 3rd Cross corner causing unbearable stench.',
    citizen_category: 'Waste Management',
    location_name: 'Lakeview Layout, Ward 7',
    latitude: 12.9542,
    longitude: 77.5722,
    status: 'Submitted',
    days_ago: 3,
  },
  {
    public_id: 'CP-2026-S022',
    description:
      'Illegal construction debris and plastic waste dumping along the Lakeview Layout perimeter walkway blocking the side gutter.',
    citizen_category: 'Waste Management',
    location_name: 'Lakeview Layout, Ward 7',
    latitude: 12.9537,
    longitude: 77.5718,
    status: 'Under Review',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S023',
    description:
      'Stormwater gutter choked with plastic litter at Lakeview Layout 4th Cross causing stagnant water pools.',
    citizen_category: 'Drainage',
    location_name: 'Lakeview Layout, Ward 7',
    latitude: 12.9544,
    longitude: 77.5725,
    status: 'Resolved',
    assigned_team: 'Stormwater & Drainage Operations',
    days_ago: 8,
  },

  // --- FALSE-POSITIVE GUARD EXAMPLES: Textually similar descriptions in completely different wards/coordinates (>6km apart) ---
  {
    public_id: 'CP-2026-S024',
    description:
      'Deep pothole in the middle of the main arterial road causing severe traffic slowdowns and forcing buses to swerve.',
    citizen_category: 'Road Damage',
    location_name: 'Northgate Industrial Avenue, Ward 1',
    latitude: 13.0350,
    longitude: 77.5600,
    status: 'Under Review',
    days_ago: 6,
  },
  {
    public_id: 'CP-2026-S025',
    description:
      'Deep pothole in the middle of the main arterial road causing severe traffic slowdowns and forcing buses to swerve.',
    citizen_category: 'Road Damage',
    location_name: 'Southridge Botanical Highway, Ward 28',
    latitude: 12.8950,
    longitude: 77.6500,
    status: 'Submitted',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S026',
    description:
      'Overflowing garbage bin near the corner park gate has not been emptied since Monday morning.',
    citizen_category: 'Waste Management',
    location_name: 'Westwood Enclave, Ward 3',
    latitude: 12.9920,
    longitude: 77.5210,
    status: 'Assigned',
    assigned_team: 'Sanitation & Solid Waste Rapid Response',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S027',
    description:
      'Overflowing garbage bin near the corner park gate has not been emptied since Monday morning.',
    citizen_category: 'Waste Management',
    location_name: 'Eastbrook Meadows, Ward 22',
    latitude: 12.9610,
    longitude: 77.7120,
    status: 'Submitted',
    days_ago: 3,
  },

  // --- LOW PRIORITY & ROUTINE REPORTS ---
  {
    public_id: 'CP-2026-S028',
    description:
      'Single streetlight lamp post #42 flickering occasionally near Greenview Park bench on quiet residential lane.',
    citizen_category: 'Streetlight',
    location_name: 'Greenview Park Lane, Ward 8',
    latitude: 12.9630,
    longitude: 77.5850,
    status: 'Submitted',
    days_ago: 7,
  },
  {
    public_id: 'CP-2026-S029',
    description:
      'Minor cosmetic crack on outer footpath tiles along Maple Tree Avenue; pedestrian passage is still clear.',
    citizen_category: 'Road Damage',
    location_name: 'Maple Tree Avenue, Ward 11',
    latitude: 12.9780,
    longitude: 77.6190,
    status: 'Resolved',
    assigned_team: 'Roads & Civil Maintenance Unit',
    days_ago: 11,
  },
  {
    public_id: 'CP-2026-S030',
    description:
      'Faded paint on municipal directional signboard and minor park bench rust near Sunrise Community Hall.',
    citizen_category: 'Other',
    location_name: 'Sunrise Community Hall, Ward 15',
    latitude: 12.9480,
    longitude: 77.6010,
    status: 'Resolved',
    assigned_team: 'General Municipal Field Inspection',
    days_ago: 12,
  },
  {
    public_id: 'CP-2026-S031',
    description:
      'Small litter bin near bus shelter needs replacement lid on Heritage Museum Road.',
    citizen_category: 'Waste Management',
    location_name: 'Heritage Museum Road, Ward 6',
    latitude: 12.9750,
    longitude: 77.5990,
    status: 'Submitted',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S032',
    description:
      'Request for pruning overgrown non-hazardous decorative shrubs along the median strip on Boulevard West.',
    citizen_category: 'Other',
    location_name: 'Boulevard West, Ward 9',
    latitude: 12.9690,
    longitude: 77.5610,
    status: 'Under Review',
    days_ago: 8,
  },

  // --- REPORTS WITHOUT GEOGRAPHIC COORDINATES (Testing missing coordinate handling) ---
  {
    public_id: 'CP-2026-S033',
    description:
      'Broken concrete drain slab and foul smell emerging from underground sewer line along Old Post Office Street.',
    citizen_category: 'Drainage',
    location_name: 'Old Post Office Street, Ward 5',
    latitude: null,
    longitude: null,
    status: 'Under Review',
    days_ago: 6,
  },
  {
    public_id: 'CP-2026-S034',
    description:
      'Three consecutive streetlights out of service near the railway underpass pedestrian stairway; commuters using phone flashlights.',
    citizen_category: 'Streetlight',
    location_name: 'Railway Underpass Approach, Ward 10',
    latitude: null,
    longitude: null,
    status: 'Assigned',
    assigned_team: 'Electrical & Streetlight Grid Team',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S035',
    description:
      'Heavy waterlogging reported near Wholesale Grain Market loading bay after overnight downpour; exact GPS not captured.',
    citizen_category: 'Waterlogging',
    location_name: 'Wholesale Grain Market, Ward 2',
    latitude: null,
    longitude: null,
    status: 'In Progress',
    assigned_team: 'Stormwater & Drainage Operations',
    days_ago: 3,
  },
  {
    public_id: 'CP-2026-S036',
    description:
      'Large fallen tree branch partially obstructing the right lane near Hilltop Reservoir curve; requires clearance.',
    citizen_category: 'Public Safety',
    location_name: 'Hilltop Reservoir Road, Ward 18',
    latitude: null,
    longitude: null,
    status: 'Resolved',
    assigned_team: 'Public Safety & Hazard Mitigation Squad',
    days_ago: 10,
  },
  {
    public_id: 'CP-2026-S037',
    description:
      'Public drinking water kiosk tap leaking continuously onto the pavement near Bus Terminal Bay 4.',
    citizen_category: 'Other',
    location_name: 'Central Bus Terminal Bay 4, Ward 4',
    latitude: null,
    longitude: null,
    status: 'Submitted',
    days_ago: 2,
  },

  // --- ADDITIONAL DIVERSE RESOLVED, IN-PROGRESS, AND MULTI-ISSUE REPORTS ---
  {
    public_id: 'CP-2026-S038',
    description:
      'Collapsed brick boundary wall and exposed rebar next to pedestrian walkway at Millers Crossing; immediate hazard to passersby.',
    citizen_category: 'Public Safety',
    location_name: 'Millers Crossing, Ward 14',
    latitude: 12.9910,
    longitude: 77.5880,
    status: 'In Progress',
    assigned_team: 'Public Safety & Hazard Mitigation Squad',
    days_ago: 2,
  },
  {
    public_id: 'CP-2026-S039',
    description:
      'Road surface sunk by 8 inches around storm sewer chamber near Millers Crossing traffic signal.',
    citizen_category: 'Road Damage',
    location_name: 'Millers Crossing, Ward 14',
    latitude: 12.9918,
    longitude: 77.5886,
    status: 'Assigned',
    assigned_team: 'Roads & Civil Maintenance Unit',
    days_ago: 4,
  },
  {
    public_id: 'CP-2026-S040',
    description:
      'Both overflowing garbage dumpsters and broken streetlight pole at Artisans Colony Main Square creating nighttime sanitation and visibility problems.',
    citizen_category: 'Waste Management',
    location_name: 'Artisans Colony Main Square, Ward 16',
    latitude: 12.9410,
    longitude: 77.5820,
    status: 'Under Review',
    days_ago: 3,
  },
  {
    public_id: 'CP-2026-S041',
    description:
      'Blocked underground sewer line causing backflow in Silk Weavers Colony 2nd Main; residents unable to use ground-floor drains.',
    citizen_category: 'Drainage',
    location_name: 'Silk Weavers Colony, Ward 13',
    latitude: 12.9660,
    longitude: 77.5770,
    status: 'Resolved',
    assigned_team: 'Stormwater & Drainage Operations',
    days_ago: 9,
  },
  {
    public_id: 'CP-2026-S042',
    description:
      'Ankle-deep stagnant water and damaged speed breaker at University Gate North crossing.',
    citizen_category: 'Waterlogging',
    location_name: 'University Gate North, Ward 19',
    latitude: 13.0120,
    longitude: 77.5710,
    status: 'Resolved',
    assigned_team: 'Stormwater & Drainage Operations',
    days_ago: 10,
  },
  {
    public_id: 'CP-2026-S043',
    description:
      'High-mast LED floodlight at Sports Complex Roundabout completely out since thunderstorm; high-speed traffic junction is dark.',
    citizen_category: 'Streetlight',
    location_name: 'Sports Complex Roundabout, Ward 20',
    latitude: 12.9590,
    longitude: 77.6380,
    status: 'In Progress',
    assigned_team: 'Electrical & Streetlight Grid Team',
    days_ago: 2,
  },
  {
    public_id: 'CP-2026-S044',
    description:
      'Unauthorized commercial waste dumping in vacant civic plot beside Metro Pillar 118 causing smoke and odor.',
    citizen_category: 'Waste Management',
    location_name: 'Metro Pillar 118 Corridor, Ward 17',
    latitude: 12.9810,
    longitude: 77.6410,
    status: 'Assigned',
    assigned_team: 'Sanitation & Solid Waste Rapid Response',
    days_ago: 5,
  },
  {
    public_id: 'CP-2026-S045',
    description:
      'Damaged pedestrian footbridge railing and missing tactile paving blocks at Riverfront Promenade.',
    citizen_category: 'Other',
    location_name: 'Riverfront Promenade, Ward 21',
    latitude: 12.9280,
    longitude: 77.5910,
    status: 'Submitted',
    days_ago: 1,
  },
];

/**
 * Idempotently seeds the synthetic dataset without deleting existing complaints
 * or duplicating previously seeded records.
 */
export async function seedSyntheticComplaints(options: { forceIfNonEmpty?: boolean } = {}): Promise<{
  inserted: number;
  skipped: number;
  total_in_db: number;
}> {
  const db = getDb();

  const existingCountRow = db
    .prepare('SELECT COUNT(*) as cnt FROM complaints')
    .get() as { cnt: number };

  if (existingCountRow.cnt > 0 && !options.forceIfNonEmpty) {
    return {
      inserted: 0,
      skipped: SYNTHETIC_SEED_DATA.length,
      total_in_db: existingCountRow.cnt,
    };
  }

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < SYNTHETIC_SEED_DATA.length; i++) {
    const item = SYNTHETIC_SEED_DATA[i];
    const exists = db
      .prepare('SELECT id FROM complaints WHERE public_id = ?')
      .get(item.public_id);

    if (exists) {
      skipped++;
      continue;
    }

    const createdDate = new Date(
      Date.now() - item.days_ago * 24 * 60 * 60 * 1000 + i * 60 * 1000
    ).toISOString();

    const resolvedDate =
      item.status === 'Resolved'
        ? new Date(Date.now() - Math.max(0, item.days_ago - 2) * 24 * 60 * 60 * 1000).toISOString()
        : null;

    await createComplaint({
      public_id: item.public_id,
      description: item.description,
      citizen_category: item.citizen_category,
      location_name: item.location_name,
      latitude: item.latitude,
      longitude: item.longitude,
      status: item.status,
      assigned_team: item.assigned_team || null,
      created_at: createdDate,
      resolved_at: resolvedDate,
      is_synthetic: true,
      enableExternalAI: false, // Deterministic fast seeding
    });
    inserted++;
  }

  const finalCountRow = db
    .prepare('SELECT COUNT(*) as cnt FROM complaints')
    .get() as { cnt: number };

  return {
    inserted,
    skipped,
    total_in_db: finalCountRow.cnt,
  };
}

// Allow direct CLI execution: `npx tsx src/server/seed_data.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase();
  seedSyntheticComplaints({ forceIfNonEmpty: true })
    .then((res) => {
      console.log(
        `[CivicPulse AI Seed] Inserted: ${res.inserted}, Skipped (already present): ${res.skipped}, Total in DB: ${res.total_in_db}`
      );
    })
    .catch((err) => {
      console.error('[CivicPulse AI Seed Error]', err);
      process.exit(1);
    });
}
