# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`

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
- GitHub syntax and product-contract smoke checks.

## Completed in backend-foundation batch
- Supabase/PostGIS migration for parking zones, entrances, evidence and moderation events.
- Explicit lifecycle: `draft` → `pending_soulflame` → review result, enforced by a database trigger.
- Public view contains only `approved` parking zones.
- Row Level Security prevents clients from approving or rejecting submissions.
- JSON Schema contract for authenticated parking submissions.
- Local-first submission adapter with a bounded offline outbox.
- Contract test verifies closed GeoJSON polygons, `pending_soulflame`, approved-only publication and offline queue behavior.
- CI validates the migration, contract and adapter.

## Completed in authenticated-submission API batch
- Added `POST /api/v2/parking-proposals` as a Vercel serverless endpoint.
- Requires a Supabase bearer token and validates it through `/auth/v1/user`.
- Validates client submission ID, name, closed GeoJSON polygon, optional points, capacity and evidence.
- Enforces server-side `source = soulflame` and `status = pending_soulflame`; clients cannot submit approved data.
- Uses the client submission ID as an idempotency key through `external_id`.
- Returns an existing proposal instead of creating a duplicate when the same ID is retried.
- Adds a bounded in-memory per-token/IP rate limit suitable as a first serverless protection layer.
- Returns `503 submission_service_not_configured` when Supabase environment variables are absent instead of pretending that data was stored.
- Adds a mocked API contract smoke test covering authentication, invalid payloads and a successful pending submission.
- CI checks endpoint syntax and runs the submission API contract test.

## Completed in protected evidence-upload batch
- Added `POST /api/v2/evidence-upload-token` for authenticated image evidence preparation.
- Accepts only JPEG, PNG and WebP images up to 8 MiB.
- Generates user-scoped storage paths under `<auth.uid()>/<uuid>.<ext>`.
- Uses a private `parking-evidence` Supabase Storage bucket with MIME and size restrictions.
- Adds Storage RLS policies restricting upload/read/delete operations to the owner path.
- Produces a short-lived HMAC upload token binding user ID, storage path, MIME type, maximum size and expiry.
- Proposal submission verifies token signature, expiry and ownership before persisting `storage_path`.
- Invalid, expired or cross-user evidence tokens are rejected; raw client storage paths are never trusted.
- Returns `503 evidence_service_not_configured` when Supabase service-role or token-secret configuration is absent.
- Adds contract tests for token tampering, expiry, ownership, MIME types and file-size limits.
- CI validates the evidence endpoint, token helper and storage migration.

## Verified
- PR #6 remains open, draft, mergeable and unmerged.
- Existing `/app` production route has not been replaced.
- Previous GitHub SmartCity V2 smoke: success.
- Previous existing SmartCity parking smoke: success.
- Previous Vercel Preview build containing the complete application code: READY.
- Previous production Overpass health endpoint: OK.
- Previous production geocoder returned Stara Zagora mall candidates.
- Previous production walking routing endpoint returned a valid route.
- Fresh Preview, runtime and browser acceptance verification is required for the current evidence-upload commit.

## Required environment before persistence
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `EVIDENCE_TOKEN_SECRET` with at least 32 characters (server-only)
- Both Supabase migrations applied in order.

## Known limitations
- The migrations are committed but not applied because no configured Supabase project credentials are present in the repository context.
- The submission and evidence endpoints cannot persist until the required environment is configured and migrations are applied.
- The local adapter is not wired into the UI until authentication exists; current proposal behavior remains local-only and safe.
- The evidence endpoint creates the signed upload contract, but the V2 UI does not upload photo bytes yet.
- The current in-memory rate limit is per serverless instance; a durable shared rate limiter is required before public scale.
- OSM coverage is incomplete and cannot represent live vacancy.
- A parking entrance is used only when a mapped `parking_entrance` is within 180 m; otherwise routing ends at the representative parking point.
- Browser runtime and touch interactions still need successful Preview testing on real phone and desktop.

## Next batch
1. Add request-level submission audit metadata and a durable rate-limit adapter contract.
2. Build service-role SoulFlame moderation API: list pending, review details, approve, reject, request changes and audit events.
3. Build the phone/desktop moderation dashboard without exposing service-role credentials.
4. Publish only approved SoulFlame zones to the V2 parking engine.
5. Add deduplication between OSM features and approved SoulFlame zones.
6. Wire authenticated submissions and evidence upload into the UI while preserving local outbox fallback.
7. Complete browser-level acceptance for search → parking → route and draw → submit.
