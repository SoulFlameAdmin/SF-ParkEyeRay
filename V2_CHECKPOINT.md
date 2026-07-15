# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`
- Completed technical roadmap stages: **Stage 1, Stage 2 and Stage 3 parking data engine**
- Active roadmap stage: **SoulFlame moderation workflow and authenticated UI submission**

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

## SoulFlame moderation backend batch
- Added server-only moderator authentication requiring both a dedicated moderator key and moderator UUID.
- Added protected `GET /api/v2/moderation-proposals` list and detail reads.
- List output is restricted to `pending_soulflame` community proposals.
- Detail output includes geometry, entrances, evidence and moderation history.
- Added protected `POST /api/v2/moderate-parking-proposal`.
- Supported actions are approve, reject and request changes.
- Reject and request-changes actions require a reason.
- Added atomic service-role-only `moderate_parking_proposal` PostGIS RPC.
- The RPC locks the proposal, verifies it is still `pending_soulflame`, changes status and writes the audit event in one transaction.
- Approval is the only transition that sets `verified_at` and `verified_by`.
- Moderation event update/delete/truncate access is revoked from public, anon and authenticated roles.
- Added deterministic moderation contract tests.

## Applied Supabase infrastructure
The connected Supabase project has the parking foundation, private evidence storage, parking data engine, search hardening and parking-engine security migrations applied.

The new SoulFlame moderation migration is committed but must not be described as applied until it is verified against the configured project.

## First real data import
Scope: `bg:sliven-core`

Imported from live OSM data into PostGIS:
- **214 active parking features**;
- **91** parking areas or representative points;
- **68** individual parking-space features;
- **55** street-parking segments.

The spatial RPC returns real Sliven results around the requested destination. Occupancy remains unknown and is labelled as non-live.

## Runtime preview verification
Vercel reached the free-plan limit of more than 100 deployments per day. The Vercel branch alias therefore still serves an older V2 build and must not be presented as the current moderation build.

The temporary keyed Supabase Edge Preview remains read-only and does not expose moderation or write operations.

## Production safety
- Production `/app` remains unchanged.
- PR #6 remains draft and unmerged.
- No service-role or moderator secret is stored in browser configuration.
- Public search remains bounded to Bulgaria, radius 100–5000 m and limited results.
- User proposals remain `pending_soulflame` until an explicit moderator transition.
- Only `approved` SoulFlame zones can enter published parking results.

## Remaining limitations
- The moderation migration is not yet confirmed as applied.
- Moderation endpoints require `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SOULFLAME_MODERATOR_KEY` server environment variables.
- Signed evidence viewing for moderators is not implemented yet.
- The moderation dashboard UI is not implemented yet.
- Authenticated proposal UI and photo-byte upload are not wired yet.
- PostGIS coverage currently includes the imported central Sliven scope, not all of Bulgaria.
- The current in-memory submission limiter must be replaced by a durable shared limiter before public scale.
- Real live vacancy requires municipality/operator/sensor data.
- A physical test on the user’s Android device remains required before replacing production.

## Next safe batch
1. Add short-lived signed evidence viewing for authenticated moderators.
2. Build the moderation dashboard as an internal route without adding a sixth primary phone action.
3. Wire authenticated V2 proposal submission and protected photo upload with local outbox fallback.
4. Apply and verify the moderation migration in the configured Supabase project.
5. Re-run V2 smoke, browser acceptance and Preview runtime checks.
6. Expand controlled OSM imports from Sliven to additional Bulgarian scopes.
