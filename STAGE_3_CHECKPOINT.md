# SmartCity V2 — Stage 3 checkpoint

## Scope
A real parking data engine that prefers SmartCity PostGIS data, merges approved SoulFlame zones, removes duplicate records and uses Overpass only as a temporary fallback.

## Implemented in GitHub
- Normalized PostGIS tables for parking features and versioned import runs.
- Spatial indexes for representative points and parking geometries.
- Bounded spatial RPC for destination-centered parking search.
- Approved-only SoulFlame community zones are combined with mapped sources.
- Entrance-only records are excluded from the parking result list.
- Source-priority deduplication prefers approved SoulFlame data over overlapping OSM data.
- Read API `GET /api/v2/parkings` uses PostGIS first and Overpass fallback second.
- Honest metadata includes source, revision, freshness and `liveOccupancy: false`.
- V2 interface displays PostGIS, approved SoulFlame or fallback source labels.
- Routing uses a mapped/approved vehicle entrance when available and otherwise uses the representative parking point.
- Version-safe OSM batch builder and service-role import CLI.
- Import-finalization RPC is unavailable to anon and authenticated roles.

## Applied Supabase infrastructure
The parking foundation, evidence storage, parking engine, search hardening and security hardening migrations are applied to the connected Supabase project.

Verified permissions:
- anon can execute bounded parking search;
- authenticated users can execute bounded parking search;
- anon cannot finalize an import;
- authenticated users cannot finalize an import;
- only service role can finalize an import.

## First real OSM import
Scope: `bg:sliven-core`

Imported from live OSM data:
- 214 active parking features;
- 91 parking areas or points;
- 68 individual parking-space features;
- 55 street-parking segments.

The spatial RPC returns real nearby Sliven parking records from PostGIS. Occupancy is not live and is never labelled as live.

## Automated verification
Latest branch commit passed:
- SmartCity V2 browser acceptance;
- SmartCity V2 smoke;
- existing SmartCity parking smoke.

The browser flow verifies normalized parking results, an approved SoulFlame source, parking selection and the driving + walking route.

## Preview
Vercel reached its free-plan daily deployment limit, so the latest Stage 3 commit has not replaced the old branch Preview.

A temporary keyed, read-only Supabase Edge Preview was deployed for the real Sliven PostGIS layer. It exposes no administrative or write operation. Its HTML and JSON parking endpoint were both verified with HTTP 200 responses from Supabase infrastructure.

## Safety
- Production `/app` is unchanged.
- PR #6 remains draft and unmerged.
- No service-role key is exposed in browser code or `vercel.json`.
- Direct public table reads remain blocked by RLS.
- The public parking RPC is bounded to Bulgaria, radius 100–5000 m and result limits.

## Remaining Stage 3 expansion
- Import the rest of Sliven municipality and then other Bulgarian cities in controlled scopes.
- Add scheduled refreshes and import health monitoring.
- Improve geometries for nationwide imports rather than only representative points.
- Add approved SoulFlame zones after the moderation dashboard is available.
- Publish the full `/v2` Stage 3 build to Vercel after the deployment quota resets.
