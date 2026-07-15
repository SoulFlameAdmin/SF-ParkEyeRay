# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`
- Completed technical roadmap stages: **Stage 1, Stage 2 and Stage 3 parking data engine**
- Active product direction: **small safe steps toward a working Waze-like navigation experience**

## Stage 1 — stable phone-first interface
- Exactly five primary actions.
- Central busy, error, retry, offline and request-cancellation state.
- Deterministic phone sheet and accessible parking selection.
- Safe proposal drawing and cancellation.
- Pixel 7 and desktop Chromium acceptance coverage.
- Android polygon drawing has pointer, click and native touch coordinate capture with deduplication.

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

## Waze navigation step 1 — GPS follow and live speed
- Added a dedicated `v2-navigation.js` module.
- The route button now has real Start/Stop navigation states.
- Navigation starts a high-accuracy `watchPosition` GPS stream.
- Current GPS speed is converted from metres per second and displayed in km/h.
- The camera follows the current position with smooth movement.
- Automatic zoom changes conservatively according to current speed.
- GPS accuracy is visible in the navigation HUD.
- Heading is reflected in the direction arrow when the browser supplies a valid heading and the vehicle is moving.
- Continuous GPS updates no longer rebuild the complete route on every position event.
- The five primary phone actions remain unchanged; Start/Stop is contextual.
- This batch does not claim road rotation, lane guidance, live traffic, police reports or speed-limit data.

## Phone drawing stability hotfix
- Browser acceptance showed that Android synthetic taps can lose a later polygon point even after `changedTouches` normalization.
- Root cause is timing at the end of the synthetic touch gesture: `pointerup`/`touchend` can race with Leaflet gesture cleanup.
- Touch drawing now captures the point at `pointerdown`, before Leaflet can consume or transform the gesture.
- `touchend`, pointer-up, click and Leaflet click remain safe fallbacks and are deduplicated.
- App overlays and Leaflet controls are still excluded, while drawing tooltips/popups no longer incorrectly block map point capture.
- Drawing mode still disables conflicting Leaflet gestures and temporary drawing layers remain non-interactive.
- The product rule remains unchanged: every submitted user polygon is `pending_soulflame` until moderation.

## SoulFlame moderation backend batch
- Added server-only moderator authentication requiring both a dedicated moderator key and moderator UUID.
- Added protected `GET /api/v2/moderation-proposals` list and detail reads.
- List output is restricted to `pending_soulflame` community proposals.
- Detail output includes geometry, entrances, evidence and moderation history.
- Added protected `POST /api/v2/moderate-parking-proposal`.
- Supported actions are approve, reject and request changes.
- Reject and request-changes actions require a reason.
- Added atomic service-role-only `moderate_parking_proposal` PostGIS RPC.
- Approval is the only transition that sets `verified_at` and `verified_by`.

## Signed moderator evidence batch
- Added protected `POST /api/v2/moderation-evidence-url`.
- Evidence ownership is verified before signing any object.
- Signed private-bucket URLs live for 30–120 seconds and responses are `no-store`.

## Applied Supabase infrastructure
The connected Supabase project has the parking foundation, private evidence storage, parking data engine, search hardening and parking-engine security migrations applied.

The SoulFlame moderation migration is committed but must not be described as applied until verified against the configured project.

## First real data import
Scope: `bg:sliven-core`

Imported from live OSM data into PostGIS:
- **214 active parking features**;
- **91** parking areas or representative points;
- **68** individual parking-space features;
- **55** street-parking segments.

Occupancy remains unknown and is labelled as non-live.

## Runtime preview verification
- The branch alias returned HTTP 200 for `/v2` on 2026-07-16, but the served HTML was still the older single-script build and must not be described as containing the newest modular navigation/drawing code.
- The latest source commit therefore still requires a READY Vercel deployment verification.
- Branch alias: `sf-parkeyeray-git-smartcity-v2-57e0ea-dimitar-lambovs-projects.vercel.app`.

## Current CI state
- Head `883ab3a66ae6487c2ec36959ce054a1c417068f4`: parking smoke and V2 smoke passed; browser acceptance failed because Android drawing intermittently stopped at two points.
- Artifact evidence showed the drawing toolbar active and `Готово` disabled after only two captured points.
- Touch-start fix head `bb6dc85a2604aee26a4380f317cd94f9f3a70ce7` captures Android points on touch `pointerdown`.
- New CI must pass before acceptance is claimed.

## Production safety
- Production `/app` remains unchanged.
- PR #6 remains draft and unmerged.
- User proposals remain `pending_soulflame` until an explicit moderator transition.
- Only `approved` SoulFlame zones can enter published parking results.
- OSM is not described as a complete physical parking inventory or as live vacancy data.

## Remaining limitations
- Leaflet does not provide true bearing-based map rotation in the current implementation; the heading arrow rotates, not the road map.
- GPS speed and heading depend on the physical device/browser and must be tested while moving outdoors.
- No automatic rerouting or route-progress snapping yet.
- No next-turn instruction banner or voice guidance yet.
- A physical Android road test remains required before replacing production.

## Next safe batch
1. Confirm green browser acceptance for touch-start Android polygon drawing.
2. Confirm a READY Vercel deployment and test the branch alias on phone and desktop.
3. Verify runtime `/api/geocode`, `/api/overpass`, driving and walking `/api/routing` against the READY branch deployment.
4. Add route-progress projection and remaining distance/time updates without rebuilding the route every second.
5. Add off-route detection and throttled rerouting.
6. Add next-maneuver banner from routing instructions.
