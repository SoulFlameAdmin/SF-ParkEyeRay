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

## Verified
- GitHub SmartCity V2 smoke: success.
- Existing SmartCity parking smoke: success.
- Vercel Preview build containing the complete application code: READY.
- Production Overpass health endpoint: OK.
- Production geocoder returns Stara Zagora mall candidates.
- Production walking routing endpoint returns a valid route.

## Known limitations
- Proposal storage is local-only in this first batch. There is no shared database or SoulFlame admin approval backend yet.
- Uploaded photo bytes are not persisted yet; only the local filename is recorded.
- OSM coverage is incomplete and cannot represent live vacancy.
- A parking entrance is used only when a mapped `parking_entrance` is within 180 m; otherwise routing ends at the representative parking point.
- Browser runtime and touch interactions still need manual Preview testing on real phone and desktop.

## Next batch
1. Create Supabase/PostGIS schema for parking sources, polygons, entrances, submissions, evidence and moderation events.
2. Add authenticated submission API with validation and rate limits.
3. Build SoulFlame moderation dashboard: review, edit polygon, approve, reject and audit history.
4. Publish only approved SoulFlame zones to the V2 parking engine.
5. Add deduplication between OSM features and approved SoulFlame zones.
6. Add browser-level smoke tests for search → parking → route and draw → submit.
