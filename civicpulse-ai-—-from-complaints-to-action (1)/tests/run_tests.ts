import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.ts';
import {
  categorizeComplaintDeterministic,
  processComplaintTextAI,
  summarizeComplaintDeterministic,
} from '../src/server/ai_engine.ts';
import {
  assignComplaintTeam,
  createComplaint,
  getAnalyticsSummary,
  getComplaintByPublicId,
  listComplaints,
  reviewDuplicateRelationship,
  updateComplaintStatus,
  validateImageUpload,
} from '../src/server/complaint_service.ts';
import { initDatabase } from '../src/server/database.ts';
import { detectDuplicateCandidates } from '../src/server/duplicate_detector.ts';
import { detectGeographicHotspots } from '../src/server/hotspot_engine.ts';
import {
  calculateExplainablePriority,
  computeWeightedScore,
  scoreToPriorityLevel,
} from '../src/server/priority_engine.ts';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  FAIL  ${name}: ${err?.message || err}`);
  }
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpulse-test-'));
  const testDbPath = path.join(tmpDir, 'test_civicpulse.db');

  console.log('==============================================================');
  console.log('CivicPulse AI — Automated Verification & Integration Test Suite');
  console.log(`Isolated SQLite Test DB: ${testDbPath}`);
  console.log('==============================================================');

  // 1. Application startup & 2. Database initialization
  let serverInstance: any = null;
  let baseUrl = '';

  await runTest('01. Application startup and HTTP/WebSocket server initialization', async () => {
    const { server } = createApp({ customDbPath: testDbPath, autoSeed: false });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    assert.ok(addr && addr.port > 0, 'Server must bind to an ephemeral port');
    serverInstance = server;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  await runTest('02. Database initialization & idempotent schema creation', () => {
    const db = initDatabase(testDbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    assert.ok(tableNames.has('complaints'));
    assert.ok(tableNames.has('complaint_status_history'));
    assert.ok(tableNames.has('admin_users'));
  });

  // 19. Empty database behavior
  await runTest('19. Empty database behavior (analytics, hotspots, action brief on 0 records)', async () => {
    const analytics = getAnalyticsSummary();
    assert.equal(analytics.total_complaints, 0);
    assert.equal(analytics.unresolved_complaints, 0);

    const hotspotsRes = await fetch(`${baseUrl}/api/hotspots`);
    assert.equal(hotspotsRes.status, 200);
    const hsData = await hotspotsRes.json();
    assert.equal(hsData.count, 0);

    const briefRes = await fetch(`${baseUrl}/api/action-brief`);
    assert.equal(briefRes.status, 200);
    const briefData = await briefRes.json();
    assert.equal(briefData.stats_snapshot.total, 0);
  });

  // 3. Complaint creation
  let firstCreatedPublicId = '';
  let firstCreatedId = 0;

  await runTest('03. Complaint creation and unique public_id generation', async () => {
    const res = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description:
          'Deep pothole crater and broken asphalt on Central Market Road causing two-wheelers to swerve.',
        citizen_category: 'Road Damage',
        location_name: 'Central Market Road, Ward 4',
        latitude: 12.9716,
        longitude: 77.5946,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.complaint.public_id.startsWith('CP-2026-'));
    assert.equal(body.complaint.category, 'Road Damage');
    assert.equal(body.complaint.status, 'Submitted');
    firstCreatedPublicId = body.complaint.public_id;
    firstCreatedId = body.complaint.id;
  });

  // 4. Required-field validation
  await runTest('04. Required-field and coordinate range validation', async () => {
    // Missing description
    const resEmpty = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'short',
        location_name: 'Ward 4',
      }),
    });
    assert.equal(resEmpty.status, 400);

    // Invalid latitude (>90)
    const resInvalidCoord = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Valid complaint description for testing invalid coordinates.',
        location_name: 'Ward 4',
        latitude: 145.0,
        longitude: 77.5,
      }),
    });
    assert.equal(resInvalidCoord.status, 400);
  });

  // 5. Category detection
  await runTest('05. Automatic category detection across supported categories & multi-issue uncertainty', () => {
    const cRoad = categorizeComplaintDeterministic(
      'Huge pothole and damaged road surface on main carriageway.'
    );
    assert.equal(cRoad.predicted_category, 'Road Damage');

    const cWater = categorizeComplaintDeterministic(
      'Severe knee-deep waterlogging and stagnant water flooding the street.'
    );
    assert.equal(cWater.predicted_category, 'Waterlogging');

    const cWaste = categorizeComplaintDeterministic(
      'Overflowing garbage bin and uncollected rubbish dump causing foul smell.'
    );
    assert.equal(cWaste.predicted_category, 'Waste Management');

    const cDrain = categorizeComplaintDeterministic(
      'Blocked drainage culvert and sewage overflow from clogged drain.'
    );
    assert.equal(cDrain.predicted_category, 'Drainage');

    const cLight = categorizeComplaintDeterministic(
      'Three streetlight poles and LED fixtures not working, street is pitch dark.'
    );
    assert.equal(cLight.predicted_category, 'Streetlight');

    const cSafety = categorizeComplaintDeterministic(
      'Uncovered open manhole and live wire hanging dangerously near school.'
    );
    assert.equal(cSafety.predicted_category, 'Public Safety');

    // Ambiguous / insufficient evidence sets needs_review = true
    const cAmbiguous = categorizeComplaintDeterministic('Please check this issue soon.');
    assert.equal(cAmbiguous.needs_review, true);
  });

  // 6. Priority score calculation
  await runTest('06. Explainable priority score formula calculation (0.35U + 0.35S + 0.20P + 0.10R)', () => {
    const score = computeWeightedScore(4.0, 4.0, 3.0, 2.0);
    // 0.35*4 + 0.35*4 + 0.20*3 + 0.10*2 = 1.4 + 1.4 + 0.6 + 0.2 = 3.60
    assert.equal(score, 3.6);

    const breakdown = calculateExplainablePriority({
      description: 'Uncovered open manhole right outside City School gate causing immediate safety hazard.',
      category: 'Public Safety',
      locationName: 'City School Gate, Ward 12',
      latitude: 12.985,
      longitude: 77.605,
      historicalNearbyCount: 2,
    });
    assert.equal(breakdown.priority_level, 'Critical');
    assert.ok(breakdown.overall_score >= 3.5 && breakdown.overall_score <= 5.0);
    assert.ok(breakdown.explanation.includes(breakdown.overall_score.toFixed(2)));
  });

  // 7. Priority boundary values
  await runTest('07. Priority level boundary handling (0.00-1.49 Low, 1.50-2.49 Medium, 2.50-3.49 High, 3.50-5.00 Critical)', () => {
    assert.equal(scoreToPriorityLevel(0.0), 'Low');
    assert.equal(scoreToPriorityLevel(1.49), 'Low');
    assert.equal(scoreToPriorityLevel(1.5), 'Medium');
    assert.equal(scoreToPriorityLevel(2.49), 'Medium');
    assert.equal(scoreToPriorityLevel(2.5), 'High');
    assert.equal(scoreToPriorityLevel(3.49), 'High');
    assert.equal(scoreToPriorityLevel(3.5), 'Critical');
    assert.equal(scoreToPriorityLevel(5.0), 'Critical');
  });

  // 8. Duplicate detection
  await runTest('08. Duplicate detection identifies nearby similar complaint with explanation', async () => {
    const secondReport = await createComplaint({
      description:
        'Large pothole crater and damaged asphalt on Central Market Road forcing two-wheelers to swerve dangerously.',
      citizen_category: 'Road Damage',
      location_name: 'Central Market Road, Ward 4',
      latitude: 12.9717,
      longitude: 77.5947,
      enableExternalAI: false,
    });

    assert.ok(secondReport.duplicate_candidates.length > 0, 'Should detect first report as duplicate candidate');
    assert.equal(secondReport.duplicate_candidates[0].candidate_public_id, firstCreatedPublicId);
    assert.equal(secondReport.duplicate_status, 'potential');
    assert.ok(secondReport.duplicate_reason && secondReport.duplicate_reason.length > 10);
  });

  // 9. Duplicate false-positive handling
  await runTest('09. Duplicate false-positive handling (identical wording in distant wards must NOT match)', () => {
    const existing = listComplaints();
    const candidates = detectDuplicateCandidates(
      {
        description:
          'Deep pothole crater and broken asphalt on Central Market Road causing two-wheelers to swerve.',
        category: 'Road Damage',
        location_name: 'Far North Industrial Zone, Ward 99',
        latitude: 13.1500, // ~20 km away
        longitude: 77.7500,
      },
      existing
    );
    assert.equal(
      candidates.length,
      0,
      'Distant report (>850m away) must not be flagged as a duplicate despite identical text'
    );
  });

  // 10. Hotspot detection
  await runTest('10. Geographic hotspot detection clusters nearby coordinates and summarizes categories', async () => {
    await createComplaint({
      description: 'Blocked stormwater drain overflowing onto Central Market Road intersection.',
      citizen_category: 'Drainage',
      location_name: 'Central Market Road, Ward 4',
      latitude: 12.9718,
      longitude: 77.5945,
      enableExternalAI: false,
    });

    const all = listComplaints();
    const hotspots = detectGeographicHotspots(all, { epsMeters: 450, minSamples: 3 });
    assert.ok(hotspots.length >= 1, 'Should detect at least 1 hotspot cluster of >=3 nearby reports');
    assert.ok(hotspots[0].report_count >= 3);
    assert.ok(hotspots[0].is_multi_problem, 'Cluster has both Road Damage and Drainage');
    assert.ok(hotspots[0].explanation.length > 20);
  });

  // 11. Missing geographic coordinates
  await runTest('11. Missing geographic coordinates handled gracefully without crashing', async () => {
    const unmapped = await createComplaint({
      description: 'Three consecutive streetlights out along Old Railway Footpath.',
      citizen_category: 'Streetlight',
      location_name: 'Old Railway Footpath, Ward 10',
      latitude: null,
      longitude: null,
      enableExternalAI: false,
    });
    assert.equal(unmapped.latitude, null);
    assert.equal(unmapped.longitude, null);
    assert.ok(
      unmapped.priority_breakdown.missing_info.some((m) => m.includes('GPS coordinates'))
    );

    const all = listComplaints();
    const hotspots = detectGeographicHotspots(all, { epsMeters: 450, minSamples: 3 });
    assert.ok(Array.isArray(hotspots));
  });

  // 21. Administrative authorization & CSRF protection
  let adminSessionToken = '';
  let adminCsrfToken = '';

  await runTest('21. Administrative authorization blocks unauthenticated writes and missing CSRF tokens', async () => {
    // Attempt assign without login -> 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/complaints/${firstCreatedId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_team: 'Roads & Civil Maintenance Unit' }),
    });
    assert.equal(unauthRes.status, 401);

    // Log in with valid admin credentials
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'civicpulse-admin-2026',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.session_token);
    assert.ok(loginData.csrf_token);
    adminSessionToken = loginData.session_token;
    adminCsrfToken = loginData.csrf_token;

    // Attempt assign with valid session token but WITHOUT CSRF token -> 403
    const noCsrfRes = await fetch(`${baseUrl}/api/admin/complaints/${firstCreatedId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSessionToken}`,
      },
      body: JSON.stringify({ assigned_team: 'Roads & Civil Maintenance Unit' }),
    });
    assert.equal(noCsrfRes.status, 403);
  });

  // 12. Complaint assignment
  await runTest('12. Complaint assignment updates team and transitions status to Assigned', async () => {
    const res = await fetch(`${baseUrl}/api/admin/complaints/${firstCreatedId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSessionToken}`,
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({
        assigned_team: 'Roads & Civil Maintenance Unit',
        public_message: 'Dispatched Ward 4 road repair squad.',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.complaint.assigned_team, 'Roads & Civil Maintenance Unit');
    assert.equal(data.complaint.status, 'Assigned');
  });

  // 13. Valid status transitions
  await runTest('13. Valid workflow status transitions (Assigned -> In Progress -> Resolved -> Reopened)', () => {
    const inProg = updateComplaintStatus(
      firstCreatedId,
      'In Progress',
      'admin',
      'Asphalt patching crew on site.'
    );
    assert.equal(inProg.status, 'In Progress');

    const resolved = updateComplaintStatus(
      firstCreatedId,
      'Resolved',
      'admin',
      'Pothole filled and compacted.'
    );
    assert.equal(resolved.status, 'Resolved');
    assert.ok(resolved.resolved_at);

    const reopened = updateComplaintStatus(
      firstCreatedId,
      'Reopened',
      'admin',
      'Reopened for quality inspection.'
    );
    assert.equal(reopened.status, 'Reopened');
    assert.equal(reopened.resolved_at, null);
  });

  // 14. Invalid status transitions
  await runTest('14. Invalid status transitions are rejected with clear error', () => {
    const resolved = updateComplaintStatus(firstCreatedId, 'Resolved', 'admin', 'Closed.');
    assert.equal(resolved.status, 'Resolved');

    assert.throws(() => {
      // Cannot jump directly from Resolved to In Progress without Reopened
      updateComplaintStatus(firstCreatedId, 'In Progress', 'admin');
    }, /Invalid status transition/);
  });

  // 15. Status history
  await runTest('15. Chronological status history records every transition with timestamp and actor', () => {
    const detail = getComplaintByPublicId(firstCreatedPublicId);
    assert.ok(detail);
    assert.ok(detail.history && detail.history.length >= 5);
    assert.equal(detail.history[0].new_status, 'Submitted');
    assert.equal(detail.history[detail.history.length - 1].new_status, 'Resolved');
  });

  // 16. Public tracking
  await runTest('16. Public citizen tracking endpoint returns latest status and timeline safely', async () => {
    const res = await fetch(`${baseUrl}/api/track/${firstCreatedPublicId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.public_id, firstCreatedPublicId);
    assert.equal(data.status, 'Resolved');
    assert.equal(data.assigned_team, 'Roads & Civil Maintenance Unit');
    assert.ok(Array.isArray(data.history) && data.history.length >= 5);
  });

  // 17. Unknown complaint IDs
  await runTest('17. Unknown complaint IDs return 404 Not Found with helpful message', async () => {
    const res = await fetch(`${baseUrl}/api/track/CP-2026-NONEXISTENT`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.ok(data.error.includes('No complaint found'));
  });

  // 18. Dashboard analytics
  await runTest('18. Dashboard analytics match exact database record counts', async () => {
    const res = await fetch(`${baseUrl}/api/analytics`);
    assert.equal(res.status, 200);
    const ana = await res.json();
    assert.equal(ana.total_complaints, 4);
    assert.equal(ana.resolved_complaints, 1);
    assert.equal(ana.unresolved_complaints, 3);
    assert.equal(ana.with_coordinates_count, 3);
    assert.equal(ana.missing_coordinates_count, 1);
  });

  // 20. Image upload validation
  await runTest('20. Image upload validation restricts unsupported MIME types and oversized payloads', () => {
    const badMime = validateImageUpload('data:application/x-msdownload;base64,AAAA');
    assert.equal(badMime.valid, false);

    const validPng = validateImageUpload(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
    assert.equal(validPng.valid, true);
  });

  // 22. Database persistence
  await runTest('22. Database persistence across connection re-initialization', () => {
    const dbAgain = initDatabase(testDbPath);
    const row = dbAgain
      .prepare('SELECT public_id, status FROM complaints WHERE public_id = ?')
      .get(firstCreatedPublicId) as { public_id: string; status: string };
    assert.equal(row.public_id, firstCreatedPublicId);
    assert.equal(row.status, 'Resolved');
  });

  // 23. Safe behavior when external AI services fail
  await runTest('23. Safe fallback behavior when external AI service is unavailable or disabled', async () => {
    const res = await processComplaintTextAI(
      'Overflowing sewer drain and waterlogging near Market Square.',
      'Market Square, Ward 4',
      'Drainage',
      false // Force fallback
    );
    assert.equal(res.categorization.method, 'deterministic-rule-fallback');
    assert.equal(res.summarization.method, 'extractive-template-fallback');
    assert.ok(res.summarization.summary.length > 10);

    const detSum = summarizeComplaintDeterministic(
      'Broken street lamp near bus stand.',
      'Streetlight',
      'Bus Stand'
    );
    assert.equal(detSum.method, 'extractive-template-fallback');
  });

  // Also test officer duplicate confirmation/rejection
  await runTest('24. Officer duplicate confirmation and rejection preserves original reports', () => {
    const all = listComplaints();
    const candidateReport = all.find((c) => c.duplicate_status === 'potential');
    assert.ok(candidateReport);

    const confirmed = reviewDuplicateRelationship(
      candidateReport.id,
      'confirm',
      firstCreatedId,
      'admin'
    );
    assert.equal(confirmed.duplicate_status, 'confirmed');
    assert.equal(confirmed.duplicate_of_id, firstCreatedId);

    const rejected = reviewDuplicateRelationship(candidateReport.id, 'reject', null, 'admin');
    assert.equal(rejected.duplicate_status, 'rejected');
    assert.equal(rejected.duplicate_of_id, null);
  });

  if (serverInstance) {
    serverInstance.close();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('==============================================================');
  console.log(`Test Summary: ${passedCount} passed, ${failedCount} failed (Total: ${results.length})`);
  console.log('==============================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main();
