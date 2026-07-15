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
- Android drawing now captures points at native `touchstart`, before Leaflet gesture cleanup, with pointer/click fallbacks and deduplication.
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
- Remaining driving distance and duration update without rebuilding the route every second.
- ETA is calculated from the remaining route duration.
- Off-route detection requires three consecutive samples beyond a threshold based on GPS accuracy.
- Automatic rerouting is throttled with a 30-second cooldown and suppressed while offline or already rerouting.
- Route fitting is disabled while active navigation is following the user.
- Start/Stop remains contextual and does not add a sixth primary action.
- This batch does not claim map-bearing rotation, lane guidance, speed limits, live traffic or police reports.

## SoulFlame moderation foundation
- Protected moderation list/detail endpoints.
- Approve, reject and request-changes actions.
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
- Before this batch, head `db7825ac8c7c93e976cc93dd5f7ab75dd66f53fb` had green parking/V2 smoke and red Android browser acceptance because polygon drawing stopped before three points.
- The new touch-start fix is committed and must receive green browser acceptance before the drawing defect is considered closed.
- The Vercel branch alias is protected and has previously served an older READY build; it must not be described as containing this batch until a deployment for the latest head is verified.
- Runtime checks required on the verified deployment: `/v2`, `/api/geocode`, `/api/overpass`, driving `/api/routing`, walking `/api/routing` and runtime error clusters.

## Remaining limitations
- Leaflet does not currently rotate the road map by bearing; only the heading arrow rotates.
- GPS speed, heading and rerouting need a physical Android road test outdoors.
- Route progress is geometric projection, not advanced map matching.
- No next-turn maneuver banner or voice guidance yet.
- A physical phone and desktop acceptance pass remains required before replacing production.

## Next safe batch
1. Inspect CI for the touch-start and navigation-progress heads; fix any red browser acceptance before adding more features.
2. Verify a READY Vercel deployment for the exact latest head and test all required runtime endpoints.
3. Add routing maneuver instructions and a next-turn banner.
4. Add voice prompts only after maneuver data and rerouting are stable.
5. Continue authenticated submission, evidence upload and internal moderation dashboard work without changing the five phone actions.
