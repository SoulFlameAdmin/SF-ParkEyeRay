# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-foundation`
- Draft PR: `#6`
- Preview route: `/v2`
- Master plan: issue `#5`
- Active product direction: **small safe steps toward a working Waze-like navigation experience**

## Stable product rules
- Exactly five primary phone-first actions.
- Production `/app` remains unchanged until V2 acceptance.
- Every user proposal remains `pending_soulflame` until explicit SoulFlame moderation.
- Only `approved` SoulFlame polygons may be published as SoulFlame verified.
- OSM is mapped source data, not a complete physical inventory and not live vacancy.

## Stage 1 — stable phone-first interface
- Central busy, error, retry, offline and request-cancellation state.
- Deterministic phone sheet and accessible parking selection.
- Search → destination → parking list/marker → selected parking → driving route → walking route flow.
- Polygon drawing → details → pending submission flow.
- Polygon drawing uses a dedicated transparent `draw-surface` inside the Leaflet map container and above Leaflet panes.
- Touch, pointer, mouse and synthesized Playwright taps are captured directly on that surface with deduplication.
- Conflicting map gestures remain disabled only while drawing.

## Stage 2 — search and destinations
- Debounced Bulgarian and transliterated destination suggestions.
- Result ranking by query, object type, city/name tokens, source and distance.
- Recent destination history and saved destinations.

## Stage 3 — parking data engine
- PostGIS parking tables, spatial indexes and bounded search RPC.
- OSM area, point, parking-space, street-parking and entrance support.
- Approved-only SoulFlame publication and deduplication preference over overlapping OSM data.
- `GET /api/v2/parkings` uses PostGIS first and Overpass only as fallback.
- `liveOccupancy: false` remains explicit.

## Waze navigation engine batch 1
- High-accuracy `watchPosition` GPS stream.
- Live GPS speed in km/h and GPS accuracy.
- Smooth follow camera and conservative speed-based zoom.
- Route geometry is normalized into cumulative segment distances.
- Current GPS position is projected onto the nearest route segment.
- Remaining driving distance, duration and ETA update without rebuilding the route every second.
- Off-route detection requires three consecutive samples beyond a GPS-aware threshold.
- Automatic rerouting is throttled with a 30-second cooldown.
- Start/Stop remains contextual and does not add a sixth primary action.

## Waze navigation HUD batch 2
- Routing requests ask OSRM-compatible providers for maneuver steps.
- A phone-first next-maneuver banner shows direction icon, Bulgarian instruction and distance to the maneuver.
- Supported guidance includes left/right/slight/sharp turns, U-turns, forks, ramps, merges, roundabouts and arrival.
- The maneuver updates from the same route-progress projection used by remaining distance and ETA.
- Starting navigation closes the menu, search results and parking sheet automatically.
- Navigation focus mode hides the top search shell and keeps the map, maneuver HUD and contextual Stop control visible.
- This batch does not claim lane guidance, speed limits, live traffic, police reports or true bearing-based road-map rotation.

## Waze map HUD batch 3
- The large collapsed `Паркинги наблизо` card is removed from the resting map view.
- A small pull handle remains so the parking list can still be opened without a dead control.
- A compact Waze-style speedometer appears after a valid GPS fix and updates from the same location stream.
- The current location is marked with a larger directional map marker and GPS accuracy circle.
- The directional marker preserves the last valid heading when a GPS sample has no heading.
- The compact speedometer hides while the parking list, polygon drawing or full navigation HUD is active.
- A dedicated Playwright test verifies the speedometer, hidden collapsed card content and GPS marker.

## Preview deployment recovery
- Vercel deployment errors were traced to `exceeded_serverless_functions_per_deployment`, not a generic build-rate limit.
- Hobby permits at most 12 Serverless Functions; helper files under `/api` were being counted as deployable functions.
- Evidence-token and moderator-auth helpers were moved to `server/v2`.
- Three moderation endpoints were consolidated into one protected `api/v2/moderation.js` dispatcher.
- Existing public moderation URLs remain stable through Vercel rewrites.
- A CI guard requires the repository to stay within the 12-function Hobby budget.
- No moderation rule changed: only approval can publish a SoulFlame verified polygon.

## SoulFlame moderation foundation
- Protected moderation list/detail operations.
- Approve, reject and request-changes transitions.
- Atomic moderation RPC and append-only audit history.
- Private evidence signing with short-lived URLs.
- Moderation migration remains committed but must not be described as applied until verified against the configured project.

## First real data import
Scope: `bg:sliven-core`
- 214 active parking features.
- 91 parking areas or representative points.
- 68 individual parking-space features.
- 55 street-parking segments.
- Occupancy remains unknown and non-live.

## Runtime and CI verification
- Runtime error clusters for `/v2`, `/api/geocode`, `/api/overpass` and `/api/routing` previously showed no errors in the checked window.
- Before map HUD batch 3, SmartCity parking smoke and V2 smoke were green.
- Browser acceptance was red because `document.elementFromPoint` still reached a Leaflet child instead of the fixed-position drawing surface on Android.
- The drawing surface is now moved inside `#map` with a z-index above Leaflet panes; exact-head Android and desktop acceptance must confirm the fix.
- The newest known READY Preview was for an earlier head; an exact-head READY deployment and endpoint runtime checks remain required.

## Production safety
- `/app` is unchanged.
- PR #6 remains draft and unmerged.
- Acceptance is not claimed until CI, exact-head Preview, phone and desktop checks are green.

## Remaining limitations
- Leaflet does not currently rotate the road map by bearing; only the heading indicators rotate.
- GPS speed, heading, maneuver timing and rerouting need a physical Android road test outdoors.
- Route progress is geometric projection, not advanced map matching.
- Voice guidance and lane guidance are not implemented.

## Next safe batch
1. Confirm green Android and desktop browser acceptance for the map-contained drawing surface and compact speedometer.
2. Confirm a READY Vercel deployment for the exact latest head.
3. Verify runtime `/v2`, `/api/geocode`, `/api/overpass`, driving and walking `/api/routing`.
4. Perform a real phone navigation test of speed, location marker, maneuver timing, ETA and rerouting.
5. Add voice prompts only after maneuver data is stable.
6. Continue authenticated submission, evidence upload and internal moderation dashboard work without changing the five phone actions.
