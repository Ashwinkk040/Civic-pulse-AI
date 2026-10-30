# CivicPulse AI — Five-Minute Demonstration Guide

This guide walks through a complete, reproducible **five-minute live demonstration** of **CivicPulse AI — From Complaints to Action**, covering all four stages (**Capture → Understand → Reveal → Act**) and real-time citizen tracking.

> **Note:** This demonstration works completely out-of-the-box with zero external API dependencies required (using our deterministic fallback pipeline) and automatically upgrades categorization/summarization when `GEMINI_API_KEY` is configured. All 45 pre-loaded records are clearly labeled as synthetic demonstration data.

---

## Minute 1: Submit a New Civic Complaint (CAPTURE)

1. Open the application at `http://localhost:3000`.
2. Click the **"Report an Issue"** button in the top navigation bar (or hero section) to open `/report`.
3. Click the **"Load 5-Min Demo Example"** button in the top-right corner of the form, OR enter the following test complaint manually:
   - **Issue Description:**
     ```text
     Uncovered open manhole right outside Central Market Junction metro exit with no safety barricade; knee-deep waterlogging makes it invisible to commuters and school children.
     ```
   - **Citizen-Selected Category:** `Public Safety`
   - **Location / Area Name:** `Central Market Junction, Ward 4`
   - **Latitude / Longitude:** `12.9716`, `77.5943` (or click directly on the interactive Leaflet map near Central Market Junction).
4. Click **"Submit Civic Report"**.
5. Observe the **Submission Confirmation** screen:
   - A unique, non-guessable public tracking ID (e.g., `CP-2026-XXXXXX`) is generated.
   - Click **"Copy Tracking ID"** to copy it to your clipboard.

---

## Minute 2: Inspect AI Categorization, Summary, Duplicates & Priority (UNDERSTAND)

1. On the confirmation screen, click **"Inspect AI Triage Details"** (or open **Operations** `/dashboard` and click the top complaint row).
2. Point out the **Citizen Report & AI Triage Summary** card:
   - Shows the concise **Officer Summary** along with the explicit method label (`gemini-3.8-flash` or `extractive-template-fallback`).
   - Shows the **Citizen Selected Category** alongside the **Predicted Category** (`Public Safety`), confidence score, and classification method.
3. Point out the **Explainable Priority Score Breakdown** card:
   - Displays the exact weighted formula calculation:
     `0.35×Urgency + 0.35×Safety + 0.20×People + 0.10×Recurrence`
   - Shows the **Critical** priority score (`4.38 / 5.00`) and the **Life-Safety Escalation Rule** notice triggered by `"open manhole"`.
   - Lists explicit **Factor Assumptions & Estimates** (e.g., recurrence derived from nearby historical reports in Ward 4) and recommended operational action.
4. Point out the **Duplicate Detection & Candidate Verification** card:
   - Shows ranked duplicate candidates (`CP-2026-S007` and `CP-2026-S008` at Central Market Junction) with similarity percentages, Haversine distance in meters (`~11m away`), and the reason why they were flagged.

---

## Minute 3: Discover Geographic Hotspots & Action Briefs (REVEAL)

1. Click **"Live Map"** (`/map`) in the top navigation bar.
2. Observe the **Geographic Map & Hotspot Discovery** view:
   - Individual complaints are rendered as priority-colored markers (`Critical` in red, `High` in amber, `Medium` in blue, `Low` in slate).
   - **Detected Geographic Hotspots** (`HS-01`, `HS-02`, `HS-03`, `HS-04`) are rendered as dashed spatial cluster zones with centroid badges.
3. Click **`HS-01 · Central Market Junction`** in the right-hand **Detected Geographic Hotspots** sidebar:
   - The map smoothly zooms to Central Market Junction (`Ward 4`).
   - Show that `HS-01` is flagged as a **Multi-Category Hotspot** combining `Drainage`, `Waterlogging`, `Road Damage`, `Waste Management`, and `Public Safety` reports within 450 meters.
   - Point out the **Hotspot vs. Duplicate Note**, which explains why a spatial cluster of interconnected infrastructure problems differs from a single duplicate incident.
   - Point out the **"Reports Submitted Without GPS Coordinates"** panel below the map (`CP-2026-S033` through `CP-2026-S037`), demonstrating that missing coordinates never crash the map or hide unmapped reports.

---

## Minute 4: Authenticate as Officer, Assign a Team & Update Status (ACT)

1. Navigate back to your newly submitted complaint (via **Operations** `/dashboard` -> click the top row, or click a complaint ID inside `HS-01`).
2. In the right-hand **Authority Action Console**, click **"Sign In as Municipal Officer"**.
3. Sign in using the pre-filled local demonstration credentials:
   - **Username:** `admin`
   - **Password:** `civicpulse-admin-2026`
   - Click **"Sign In & Issue CSRF Token"**.
4. Under **1. Assign / Reassign Municipal Team**:
   - Select **`Public Safety & Hazard Mitigation Squad`**.
   - Enter dispatch note: `Rapid response crew dispatched with steel manhole cover and safety barricades.`
   - Click **"Assign Team"**. Observe that the status transitions to **`Assigned`** and an audit entry is appended to the history timeline.
5. Under **2. Update Workflow Status & Category Review**:
   - Select Next Allowed Status: **`In Progress`**.
   - Enter public update message: `Field technicians on site installing replacement cover and pumping stagnant water.`
   - Click **"Save Status Transition"**.
6. *(Optional)* In the **Duplicate Detection** card on the left, click **"Confirm Duplicate"** on `CP-2026-S007` to link the reports for consolidated action while keeping both tracking IDs intact.

---

## Minute 5: Verify Real-Time Citizen Tracking (PUBLIC ACCOUNTABILITY)

1. Click **"Open Citizen Tracking View"** at the top-right of the Complaint Detail page (or click **"Track Status"** `/track` in the top navigation bar and paste your complaint ID).
2. Show the **Citizen Tracking Page**:
   - Displays the live workflow progress bar advanced to **`In Progress`**.
   - Shows the assigned department (**`Public Safety & Hazard Mitigation Squad`**).
   - Displays the complete **Chronological Status Timeline** (`Submitted → Assigned → In Progress`) with exact timestamps and officer public messages.
   - Confirm that no internal credentials or private citizen contact data are exposed.
