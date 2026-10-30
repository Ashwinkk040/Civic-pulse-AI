# CivicPulse AI — System Limitations & Transparency Note

This document provides an honest, engineering-grade disclosure of how each component in **CivicPulse AI** operates, what uses external AI versus deterministic algorithms, and what is required before real-world municipal deployment.

---

## 1. What Genuinely Uses AI vs. Deterministic Rules

| Component | Primary / External AI Mode | Default / Local Deterministic Mode | Method Label Stored in DB |
| :--- | :--- | :--- | :--- |
| **Categorization** | Server-side `gemini-3.8-flash` structured JSON classification (when `GEMINI_API_KEY` is configured and reachable within 4.5s). | Weighted domain lexicon matcher (`src/server/ai_engine.ts`) with multi-issue ambiguity and citizen-category conflict checks. | `gemini-3.8-flash` or `deterministic-rule-fallback` |
| **Summarization** | Server-side `gemini-3.8-flash` factual 1-sentence officer summary (when configured). | Sentence-level extractive & template summarizer preserving original factual clauses. | `gemini-3.8-flash` or `extractive-template-fallback` |
| **Priority Scoring** | Deterministic weighted mathematical formula (`0.35×U + 0.35×S + 0.20×P + 0.10×R`) with explicit life-safety escalation rules. | Same deterministic weighted algorithm (`src/server/priority_engine.ts`) for 100% reproducibility and auditability. | `weighted-deterministic-v1` |
| **Duplicate Detection** | Hybrid Haversine geographic distance + category compatibility + lexical-stem cosine similarity (`src/server/duplicate_detector.ts`). | Same hybrid geographic + lexical-stem algorithm. | `lexical-geo-hybrid-fallback` |
| **Geographic Hotspots** | Spatial **DBSCAN** clustering over Haversine distances (`src/server/hotspot_engine.ts`). | Same spatial DBSCAN algorithm calculated live from SQLite coordinates. | `spatial-dbscan` |
| **Operational Action Brief** | Server-side `gemini-3.8-flash` synthesis of verified database statistics (when requested). | Deterministic synthesis of live database counts, open critical hazards, and top DBSCAN hotspots. | `gemini-3.8-flash` or `deterministic-analytics-synthesis` |

We **never** label keyword rules as a trained machine-learning model, and every complaint record explicitly stores and displays the exact `category_method` and `summary_method` that produced its output.

---

## 2. External LLM & Embeddings Availability

- **External LLM (`GEMINI_API_KEY`):** Optional. If a valid `GEMINI_API_KEY` is present in the server environment, new citizen submissions use `gemini-3.8-flash` for categorization and summarization with a 4.5-second timeout. If the key is unset, placeholder (`MY_GEMINI_API_KEY`), or if a network timeout occurs, the pipeline seamlessly falls back to deterministic processing without failing the citizen's submission.
- **Semantic Embeddings:** To avoid lengthy multi-gigabyte model downloads (`sentence-transformers` / PyTorch) in a hackathon environment, duplicate detection uses a transparent **lexical-stem cosine + Haversine geographic + category compatibility** algorithm (`lexical-geo-hybrid-fallback`).
  - *Limitation:* If two citizens describe the same issue using completely disjoint vocabulary (zero shared root stems) and neither provides GPS coordinates, lexical similarity may score below threshold.

---

## 3. Synthetic Dataset Disclosure

- The seed script (`src/server/seed_data.ts`) loads **45 synthetic civic complaints** (`CP-2026-S001` through `CP-2026-S045`) across all 7 categories.
- Every seeded record is flagged with `is_synthetic = 1` in SQLite and explicitly badged as **Synthetic Demo Record** in the UI.
- No real citizens' names, phone numbers, or personal addresses are present.
- All dashboard KPIs, charts, hotspots, and action briefs are computed dynamically from the actual SQLite database records—nothing is hardcoded.

---

## 4. What Is Not Implemented (No Fake Claims)

- **Computer Vision Image Analysis:** Citizens can upload optional JPEG, PNG, or WebP photos as field evidence for officers to inspect. The application **does not** claim to perform automated pothole depth measurement or computer-vision object detection on uploaded images.
- **Emergency Dispatch Integration:** While the Priority Engine includes a life-safety escalation rule for severe hazards (e.g., open manholes, live electrical wires), CivicPulse AI is a municipal triage prototype and **not** a certified 911/112 emergency dispatch system.

---

## 5. Where Categorization or Prioritization Can Be Wrong

1. **Multi-Issue Descriptions:** A single complaint describing both an overflowing garbage dumpster and a broken streetlight pole (`CP-2026-S040`) spans multiple departments. The engine flags such reports with `Needs Officer Review` (`needs_review = true`) and allows officers to adjust the category.
2. **Text-Inferred Severity Estimates:** Urgency, Safety Impact, and People Affected are estimated from linguistic cues in the citizen's text (e.g., `"near school"`, `"knee-deep"`, `"live wire"`). Exaggerated or understated citizen descriptions can skew initial estimates until a field officer verifies the site.
3. **Missing GPS Coordinates:** Reports submitted without latitude/longitude cannot be placed on the Leaflet map or included in spatial DBSCAN clustering. They are tracked by ward name and explicitly listed in the "Reports Submitted Without GPS Coordinates" section on the Map page.

---

## 6. Why Duplicate Detection Requires Human Confirmation

Multiple reports in the same vicinity may represent:
- **True Duplicates:** Two citizens reporting the exact same uncovered manhole outside Central Market Junction metro exit (`CP-2026-S007` and `CP-2026-S008`).
- **Distinct Nearby Incidents (Hotspot):** A clogged drain, waterlogging, and a pothole within 150 meters of each other at Central Market Junction (`CP-2026-S001`, `CP-2026-S003`, `CP-2026-S005`).

Automatically merging or deleting citizen reports risks discarding critical details or silencing a separate hazard. Therefore, CivicPulse AI keeps every citizen report independently traceable and provides officers with **Confirm Duplicate** and **Reject Flag** controls.

---

## 7. Requirements Before Real Municipal Production Use

1. **Role-Based Access Control (RBAC) & SSO:** Integrate with municipal OAuth/SAML identity providers with ward-level officer permissions and audit logs.
2. **Rate Limiting & CAPTCHA:** Add IP/device rate limiting and bot protection on the public `/api/report` intake endpoint.
3. **Managed Cloud Database & Object Storage:** Migrate from local SQLite (`civicpulse.db`) and data-URI image storage to managed PostgreSQL/PostGIS and encrypted cloud object storage (e.g., Google Cloud Storage) with virus scanning.
4. **Formal Security Audit:** Conduct penetration testing, CSP header hardening, and legal privacy compliance review.
