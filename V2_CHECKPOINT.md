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
- CI now validates the migration, contract and adapter.

## Verified
- PR #6 remains open, draft, mergeable and unmerged.
- Previous GitHub SmartCity V2 smoke: success.
- Previous existing SmartCity parking smoke: success.
- Previous Vercel Preview build containing the complete application code: READY.
- Previous production Overpass health endpoint: OK.
- Previous production geocoder returned Stara Zagora mall candidates.
- Previous production walking routing endpoint returned a valid route.
- Fresh runtime verification could not be completed through the current web fetch path; no production change was made.

## Known limitations
- The migration is committed but not applied because no configured Supabase project credentials are present in the repository context.
- The authenticated `/api/v2/parking-proposals` endpoint is not implemented yet.
- The local adapter is not wired into the UI until the endpoint and authentication contract exist; current proposal behavior remains local-only and safe.
- Uploaded photo bytes are not persisted yet; only the local filename is recorded.
- OSM coverage is incomplete and cannot represent live vacancy.
- A parking entrance is used only when a mapped `parking_entrance` is within 180 m; otherwise routing ends at the representative parking point.
- Browser runtime and touch interactions still need manual Preview testing on real phone and desktop.

## Next batch
1. Add authenticated `/api/v2/parking-proposals` endpoint with schema validation, idempotency and rate limits.
2. Add evidence upload-token contract and protected storage flow.
3. Build SoulFlame moderation API and dashboard: review, edit polygon, approve, reject and audit history.
4. Publish only approved SoulFlame zones to the V2 parking engine.
5. Add deduplication between OSM features and approved SoulFlame zones.
6. Add browser-level smoke tests for search → parking → route and draw → submit.
