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
- CI now checks endpoint syntax and runs the submission API contract test.

## Verified
- PR #6 remains open, draft, mergeable and unmerged.
- Existing `/app` production route has not been replaced.
- Previous GitHub SmartCity V2 smoke: success.
- Previous existing SmartCity parking smoke: success.
- Previous Vercel Preview build containing the complete application code: READY.
- Previous production Overpass health endpoint: OK.
- Previous production geocoder returned Stara Zagora mall candidates.
- Previous production walking routing endpoint returned a valid route.
- Fresh runtime verification is still required after the current Preview deployment finishes.

## Known limitations
- The migration is committed but not applied because no configured Supabase project credentials are present in the repository context.
- The submission endpoint is implemented but cannot persist until `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured and the migration is applied.
- The local adapter is not wired into the UI until authentication exists; current proposal behavior remains local-only and safe.
- Uploaded photo bytes are not persisted yet; only note evidence is production-ready in the current contract.
- The current in-memory rate limit is per serverless instance; a durable shared rate limiter is required before public scale.
- OSM coverage is incomplete and cannot represent live vacancy.
- A parking entrance is used only when a mapped `parking_entrance` is within 180 m; otherwise routing ends at the representative parking point.
- Browser runtime and touch interactions still need manual Preview testing on real phone and desktop.

## Next batch
1. Add evidence upload-token contract with protected Supabase Storage paths and ownership checks.
2. Add durable rate limiting and request-level audit metadata.
3. Build SoulFlame moderation API and dashboard: review, edit polygon, approve, reject and audit history.
4. Publish only approved SoulFlame zones to the V2 parking engine.
5. Add deduplication between OSM features and approved SoulFlame zones.
6. Wire authenticated submissions into the UI while preserving local outbox fallback.
7. Add browser-level smoke tests for search → parking → route and draw → submit.
