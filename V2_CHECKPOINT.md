# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`
- Completed technical roadmap stages: **Stage 1, Stage 2 and Stage 3 parking-data foundation**
- Next active roadmap stage: **SoulFlame moderation workflow and authenticated UI submission**

## Completed in foundation batch
- Phone-first application shell with exactly five primary actions.
- Destination search through `/api/geocode`.
- Adaptive parking discovery at 500 m, 1 km, 2 km and 5 km.
- OSM sources: `amenity=parking`, `amenity=parking_space`, street-parking tags and `parking_entrance`.
- Parking cards, filters, map selection and saved parking places.
- Driving route to a mapped entrance or representative point.
- Walking route from parking to destination.
- External navigation fallback.
- Polygon drawing for community parking-zone proposals.
- Proposal details: access, estimated capacity, evidence and optional local photo filename.
- Local status `pending_soulflame`; proposals are explicitly not shown as verified public parking.
- Profile, proposal list and local-data deletion.

## Stage 1 — stable phone-first interface
- Added one central UI state manager for busy scopes, active action, online/offline state, retries and request cancellation.
- Exactly five primary actions remain; invalid actions do not change the active tab.
- Search, parking discovery and routing cancel stale requests through `AbortController`.
- Added explicit loading, empty, error and retry states instead of silent failures.
- Added offline banner and global retry action.
- Added deterministic mobile sheet state with `aria-expanded`.
- Added keyboard selection for parking cards.
- Clarified internal route refresh versus external turn-by-turn navigation.
- Drawing mode disables unrelated controls and safely clears incomplete geometry.
- Interface assertions fail loudly if critical controls or the five-action contract are broken.
- Playwright acceptance covers Pixel 7 emulation and desktop Chromium.

## Stage 2 — search and destinations
- Added debounced live destination suggestions.
- Preserved full submit search with stale request cancellation.
- Added ranking by normalized query, object type, matching name/city tokens, source and distance.
- Mall searches rank the actual mall above a nearby parking result with a similar name.
- Added type and city/location context for similarly named results.
- Added bounded recent destination history.
- Added saved destinations through a star control.
- Saved and recent destinations appear when the search field is focused.
- Added independent history clearing and full privacy reset.
- Added accessible listbox/option and `aria-expanded` behavior.
- Browser acceptance verifies `qmbol mol` → normalized Yambol mall ranking, history, save and reload persistence.

## Completed in backend-foundation batch
- Supabase/PostGIS migration for parking zones, entrances, evidence and moderation events.
- Explicit lifecycle: `draft` → `pending_soulflame` → review result, enforced by a database trigger.
- Public view contains only `approved` parking zones.
- Row Level Security prevents clients from approving or rejecting submissions.
- JSON Schema contract for authenticated parking submissions.
- Local-first submission adapter with a bounded offline outbox.
- Contract test verifies closed GeoJSON polygons, `pending_soulflame`, approved-only publication and offline queue behavior.

## Completed in authenticated-submission API batch
- Added `POST /api/v2/parking-proposals` as a Vercel serverless endpoint.
- Requires a Supabase bearer token and validates it through `/auth/v1/user`.
- Validates client submission ID, name, closed GeoJSON polygon, optional points, capacity and evidence.
- Enforces server-side `source = soulflame` and `status = pending_soulflame`; clients cannot submit approved data.
- Uses the client submission ID as an idempotency key through `external_id`.
- Returns an existing proposal instead of creating a duplicate when the same ID is retried.
- Adds a bounded in-memory per-token/IP rate limit as an initial protection layer.
- Returns `503 submission_service_not_configured` when Supabase environment variables are absent.

## Completed in protected evidence-upload batch
- Added `POST /api/v2/evidence-upload-token` for authenticated image evidence preparation.
- Accepts only JPEG, PNG and WebP images up to 8 MiB.
- Generates user-scoped storage paths under `<auth.uid()>/<uuid>.<ext>`.
- Uses a private `parking-evidence` Supabase Storage bucket with MIME and size restrictions.
- Adds Storage RLS policies restricting upload/read/delete operations to the owner path.
- Produces a short-lived HMAC upload token binding user ID, storage path, MIME type, maximum size and expiry.
- Proposal submission verifies token signature, expiry and ownership before persisting `storage_path`.

## Stage 3 — normalized parking data engine
- Added `parking_features` and `parking_import_runs` PostGIS tables for OSM, municipality and operator imports.
- Added source revision, source timestamps, import-run ownership and active/inactive state tracking.
- Added a versioned JSON Schema import contract for parking areas, individual spaces, street segments, entrances and points.
- Added revision-safe import CLI with `(source, external_id)` upsert semantics and explicit scope finalization.
- Added `search_parking_features` spatial RPC for destination-centered searches.
- The spatial result combines imported parking data with **only approved** SoulFlame zones.
- Added server-side deduplication by source identity, distance and normalized names.
- Approved SoulFlame records win over overlapping OSM records while preserving all source references.
- Added `/api/v2/parkings` as the normalized V2 parking endpoint.
- PostGIS is the primary path when configured; Overpass is retained only as a temporary fallback.
- Every result carries source, verification status, origin, revision/freshness and entrance/representative-point data.
- The API and UI explicitly report `liveOccupancy: false` and never imply a complete list of physical parking places.
- Added browser acceptance fixtures for approved SoulFlame + imported OSM data, five actions, route-to-entrance and walking-to-destination.
- Added deterministic engine tests for validation, import normalization, PostGIS results, Overpass fallback and deduplication.

## Current verification
- PR #6 remains open, draft, mergeable and unmerged.
- Existing `/app` production route has not been replaced.
- Latest completed existing SmartCity parking smoke: **success**.
- SmartCity V2 smoke for the current Stage 3 head: **running**.
- SmartCity V2 browser acceptance for the current Stage 3 head: **running**.
- Vercel branch Preview alias is recorded by Vercel as **READY** at `sf-parkeyeray-git-smartcity-v2-57e0ea-dimitar-lambovs-projects.vercel.app`.
- Direct Preview runtime probing from the current execution environment was blocked by DNS resolution, so no false runtime-success claim is recorded for this batch.

## Required environment before shared persistence
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `EVIDENCE_TOKEN_SECRET` with at least 32 characters (server-only)
- Supabase migrations applied in order.

## Known limitations
- Supabase migrations are committed but not yet confirmed as applied in a configured project.
- Submission, evidence and PostGIS-primary parking endpoints cannot use shared persistence until the required environment is configured.
- The local proposal adapter is not yet wired into authenticated UI submission.
- The evidence endpoint creates a protected upload contract, but the V2 UI does not upload photo bytes yet.
- The current in-memory rate limit is per serverless instance; a durable shared limiter is required before public scale.
- OSM coverage is incomplete and cannot represent live vacancy.
- Overpass remains a temporary runtime fallback when PostGIS is unconfigured, empty or unavailable.
- A parking entrance is used only when a mapped entrance is sufficiently close; otherwise routing ends at the representative parking point.
- A physical test on an actual Android device is still required before replacing production.

## Next safe batch — moderation and authenticated submission UI
1. Add service-role-only moderation list/detail endpoints for `pending_soulflame` proposals.
2. Add approve, reject and changes-requested transitions with immutable moderator audit history.
3. Add signed evidence viewing for moderators without making the storage bucket public.
4. Build the SoulFlame moderation dashboard without adding a sixth primary phone action.
5. Wire authenticated V2 proposal submission and protected photo upload with local outbox fallback.
6. Confirm that only `approved` polygons enter the public parking engine and that rejection never publishes data.
7. Re-run Preview, phone and desktop acceptance before considering PR readiness.
