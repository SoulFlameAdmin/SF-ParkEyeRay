# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`
- Completed technical roadmap stages: **Stage 1, Stage 2 and Stage 3 parking data engine**
- Next active roadmap stage: **SoulFlame moderation workflow and authenticated UI submission**

## Stage 1 — stable phone-first interface
- Exactly five primary actions.
- Central busy, error, retry, offline and request-cancellation state.
- Deterministic phone sheet and accessible parking selection.
- Safe proposal drawing and cancellation.
- Pixel 7 and desktop Chromium acceptance coverage.

## Stage 2 — search and destinations
- Debounced Bulgarian and transliterated destination suggestions.
- Result ranking by query, object type, city/name tokens, source and distance.
- Mall searches prioritize the actual mall above a nearby parking result.
- Recent destination history and saved destinations.
- Accessible listbox behavior and local privacy reset.

## Stage 3 — live normalized parking data engine
- PostGIS tables `parking_features` and `parking_import_runs`.
- Spatial indexes and bounded `search_parking_features` RPC.
- Versioned import batches with source revision and scope tracking.
- OSM area, point, individual-space, street-parking and entrance support.
- Approved-only SoulFlame zones combined with imported mapped data.
- Deduplication prefers an approved SoulFlame record over overlapping OSM data while preserving source references.
- `GET /api/v2/parkings` uses PostGIS first and Overpass only as fallback.
- Results expose source, verification state, revision/freshness, representative point and vehicle entrance.
- UI labels PostGIS, approved SoulFlame and fallback data honestly.
- `liveOccupancy: false` is explicit; no live vacancy is implied.

## Applied Supabase infrastructure
The connected Supabase project now has the following migrations applied:
- SmartCity parking foundation;
- private evidence storage;
- parking data engine;
- search hardening;
- parking-engine security hardening.

Security verification:
- anon and authenticated roles can execute only the bounded public parking search;
- anon and authenticated roles cannot finalize imports;
- only service role can finalize an import;
- parking feature/import tables remain protected by RLS;
- no service-role key is exposed in browser configuration.

## First real data import
Scope: `bg:sliven-core`

Imported from live OSM data into PostGIS:
- **214 active parking features**;
- **91** parking areas or representative points;
- **68** individual parking-space features;
- **55** street-parking segments.

The spatial RPC returns real Sliven results around the requested destination. Occupancy remains unknown and is labelled as non-live.

## Automated verification
The Stage 3 code commit passed:
- SmartCity V2 browser acceptance;
- SmartCity V2 smoke;
- existing SmartCity parking smoke.

The acceptance flow covers normalized PostGIS records, an approved SoulFlame source fixture, selection, vehicle routing to an entrance and walking to the destination.

## Runtime preview verification
Vercel reached the free-plan limit of more than 100 deployments per day. The Vercel branch alias therefore still serves an older V2 build and must not be presented as Stage 3.

A temporary keyed, read-only Supabase Edge Preview was deployed for Stage 3. Supabase infrastructure verified:
- preview HTML response: HTTP 200;
- parking JSON response: HTTP 200;
- the JSON response contains real PostGIS Sliven parking records.

## Production safety
- Production `/app` remains unchanged.
- PR #6 remains draft and unmerged.
- The temporary preview has no administrative or write operations.
- Public search is bounded to Bulgaria, radius 100–5000 m and limited results.

## Existing backend foundation
- Authenticated parking proposal contract with forced `pending_soulflame` status.
- Idempotent proposal submission API.
- Private evidence bucket and signed evidence-token contract.
- Moderation state machine and approved-only public publication rule.

## Remaining limitations
- PostGIS coverage currently includes the imported central Sliven scope, not all of Bulgaria.
- Other areas depend on the intended Overpass fallback after the complete V2 build is deployed.
- Full polygon geometries should be preserved for nationwide import batches; the first live Sliven bootstrap includes representative points for many features.
- Authenticated proposal UI and photo upload are not wired yet.
- The current in-memory submission limiter must be replaced by a durable shared limiter before public scale.
- Real live vacancy requires municipality/operator/sensor data.
- A physical test on the user’s Android device remains required before replacing production.

## Next safe batch — moderation and authenticated submission UI
1. Build service-role-only list and detail endpoints for `pending_soulflame` proposals.
2. Add approve, reject and request-changes actions with immutable audit history.
3. Add signed evidence viewing for moderators.
4. Build the SoulFlame moderation dashboard without adding a sixth phone action.
5. Wire authenticated proposal submission and protected photo upload with local outbox fallback.
6. Ensure only approved polygons enter the parking engine.
7. Expand controlled OSM imports from Sliven to additional Bulgarian scopes.
