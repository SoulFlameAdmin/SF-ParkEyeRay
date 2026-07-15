# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`
- Completed technical roadmap stages: **Stage 1 and Stage 2**
- Next active roadmap stage: **Stage 3 — parking data engine**

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
- Playwright acceptance passes on Pixel 7 emulation and desktop Chromium.

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

## Current verification
- PR #6 remains open, draft, mergeable and unmerged.
- Existing `/app` production route has not been replaced.
- Latest SmartCity V2 browser acceptance: **success**.
- Latest SmartCity V2 smoke: **success**.
- Latest existing SmartCity parking smoke: **success**.
- Vercel branch Preview containing Stage 2 application files: **READY**.
- Preview directly serves `v2-destinations.js` with ranking, history and saved-place implementation.
- Production geocoder returns Yambol mall candidates for Latin input.

## Required environment before shared persistence
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `EVIDENCE_TOKEN_SECRET` with at least 32 characters (server-only)
- Supabase migrations applied in order.

## Known limitations
- Supabase migrations are committed but not yet applied in a configured project.
- Submission and evidence endpoints cannot persist until the required environment is configured.
- Current destination history and saved destinations are local to one device.
- The local proposal adapter is not yet wired into authenticated UI submission.
- The evidence endpoint creates a protected upload contract, but the V2 UI does not upload photo bytes yet.
- The current in-memory rate limit is per serverless instance; a durable shared limiter is required before public scale.
- OSM coverage is incomplete and cannot represent live vacancy.
- A parking entrance is used only when a mapped `parking_entrance` is within 180 m; otherwise routing ends at the representative parking point.
- A physical test by the user on their actual Android device is still useful before replacing production.

## Next stage — Stage 3 parking data engine
1. Define the normalized PostGIS model for OSM areas, parking spaces, street-parking segments and entrances.
2. Build import/upsert contracts and source revision tracking.
3. Add a spatial parking-search API around the destination.
4. Combine only approved SoulFlame zones with imported OSM data.
5. Deduplicate overlapping OSM and SoulFlame features.
6. Keep source, verification status and freshness in every result.
7. Preserve Overpass only as a temporary fallback, not as the primary request path.
