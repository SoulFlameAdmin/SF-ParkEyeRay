# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-precision-gps`
- Draft PR: `#9`
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
- Touch is captured at both the map root and drawing surface; pointer/touch/click fallbacks are deduplicated to exactly one point per physical tap.
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

## SoulFlame boot and entry batch 4
- `/v2` opens behind a full-screen fire splash instead of exposing an uncentered map.
- The English boot copy includes `Licensed by SoulFlame` and GPS progress states.
- The first valid GPS fix is always centered before the interface is revealed.
- Initial GPS zoom is fixed at level `18` on every fresh page entry.
- A manual zoom-in or zoom-out disables automatic GPS camera following.
- Automatic following and zoom `18` can be restored only through the existing `◎` location button.
- The last valid position is stored locally for a fast background map while a fresh GPS fix is requested.
- A 9-second fallback and explicit GPS error paths prevent the splash from becoming a dead screen.
- Browser coverage verifies the license copy, hidden splash after readiness, GPS center and initial zoom.

## Precision heading stabilization batch 5
- The arrow represents the physical top-centre direction of the phone screen.
- Portrait and landscape screen-angle changes reset compass alignment without rotating the map.
- Compass and GPS heading are fused by speed and sensor confidence.
- Small heading changes inside a dead-zone are ignored to prevent visible jitter.
- Rendering uses `requestAnimationFrame` with bounded angular velocity instead of raw sensor jumps.
- Suspected 180-degree magnetic reversals while stationary require three consistent samples before acceptance.
- Absolute orientation samples take priority over duplicate relative orientation events.
- Heading sensor state is reset after background/foreground transitions.
- GPS remains the fallback when orientation permission is denied or compass data is stale.

## Heading confidence and route alignment batch 6
- A compact non-interactive heading confidence indicator reports stable, smoothing or calibration-needed state without adding a sixth primary action.
- Confidence combines GPS accuracy, available heading source, compass weakness and vehicle GPS-heading availability.
- Pressing the existing `◎` button while confidence is weak shows a figure-eight calibration instruction.
- During active navigation only, the displayed arrow may snap to the nearest route segment when GPS accuracy, distance, direction and confidence all pass conservative thresholds.
- Route snap affects only the visual marker; raw GPS state and the accuracy circle remain untouched.
- Snap is rejected when direction differs by more than 58 degrees, accuracy is worse than 35 metres or the route is too far from the raw fix.
- OSM and routing data are still not described as live occupancy or complete physical parking inventory.

## Visible-screen parking refresh batch 7
- When the existing `Паркинги` layer is enabled, the app requests the current map viewport instead of a fixed user-only radius.
- Parking data refreshes after map pan or zoom with a short debounce and request cancellation.
- Returned records are filtered to markers whose representative point is inside the visible map bounds.
- The API request uses the supported maximum result limit of 150 and a viewport-derived radius capped at 5 km.
- The parking count and list describe the current visible screen.
- This is near-real-time viewport refresh, not live occupancy and not a guarantee of every physical parking facility.
- Disabling the layer aborts pending work and clears parking markers.
- No sixth primary action was added.

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
- Exact-head Preview and CI for PR #9 must be rechecked after batch 7 head `9ee5bee610f142611b9c46e125505e4fa9551c12` or newer.
- Browser acceptance must cover startup zoom 18, manual zoom disabling follow, `◎` restoring follow, confidence indicator states, viewport parking refresh and no dead controls.
- Physical Android acceptance must verify portrait direction, landscape direction, stationary jitter, calibration hint, walking turns, vehicle GPS-heading takeover, conservative route snap and parking refresh while panning/zooming.

## Production safety
- `/app` is unchanged.
- PR #9 remains draft and unmerged.
- Acceptance is not claimed until CI, exact-head Preview, phone and desktop checks are green.

## Remaining limitations
- Leaflet does not currently rotate the road map by bearing; only the heading indicators rotate.
- Browser compass quality depends on device hardware, calibration and magnetic interference.
- Route snap is conservative visual alignment, not advanced map matching.
- Visible-screen parking refresh is limited by the API radius/result caps and available mapped/approved data.
- GPS speed, heading, maneuver timing and rerouting need a physical Android road test outdoors.
- Voice guidance and lane guidance are not implemented.

## Next safe batch
1. Confirm a READY Vercel deployment for exact head `9ee5bee610f142611b9c46e125505e4fa9551c12` or newer.
2. Verify `/v2`, `/api/geocode`, `/api/overpass`, driving and walking `/api/routing` on that Preview.
3. Test Android and desktop: parking layer on → pan/zoom → only visible markers/list update → layer off clears markers.
4. Re-run search → destination → parking → driving route → walking route so viewport refresh does not break destination routing.
5. Continue authenticated submission, evidence upload and internal moderation dashboard work without changing the five phone actions.