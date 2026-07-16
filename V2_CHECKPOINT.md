# SmartCity V2 checkpoint

## Active work
- Branch: `smartcity-v2-precision-gps`
- Draft PR: `#9`
- Preview route: `/v2`
- Master plan: issue `#5`
- Production `/app` remains unchanged.

## Non-negotiable product rules
- Exactly five primary phone-first actions and no dead controls.
- Every user proposal starts as `pending_soulflame`.
- Only explicitly `approved` polygons may be published as SoulFlame verified.
- OSM is mapped source data, not a complete physical parking inventory and not live vacancy.
- PR #9 remains draft and unmerged until Preview, CI, phone and desktop acceptance are green.

## Stable V2 flows
- Search → destination → parking list/marker → selected parking → driving route to entrance/representative point → walking route to destination.
- Draw polygon → details → evidence → submission status.
- Parking layer loads mapped parking features for the visible map viewport and refreshes after pan/zoom while enabled.
- Parking results continue to state explicitly that occupancy is not live.

## Parking and moderation foundation
- PostGIS parking schema, indexes and bounded search RPC are committed.
- `GET /api/v2/parkings` prefers PostGIS and uses Overpass only as fallback.
- OSM/SoulFlame deduplication prefers approved SoulFlame records when overlap is detected.
- Authenticated submission, private evidence and protected moderation foundations are present.
- Approval/rejection/request-changes and append-only audit history remain the intended moderation path.
- A migration committed to the repository must not be described as applied until verified against the configured Supabase project.

## Navigation foundation
- High-accuracy `watchPosition` with fresh GPS samples.
- Startup centers the first valid fix at zoom `18`.
- Manual zoom disables automatic follow.
- Existing `◎` location control restores follow and zoom `18`.
- GPS jitter and physically impossible jumps are filtered.
- Compass and GPS heading are fused by speed and sensor confidence.
- The arrow represents the physical top-centre direction of the visible phone screen.
- Portrait/landscape, background/foreground and 359° → 0° transitions are handled without full rotation.
- Route progress, maneuver HUD, off-route confirmation and throttled rerouting are implemented.

## Unified Smart Arrow patch — batch 7
Head code commit: `27c75e8c65db23027816a53a3daa883c85c5f0d2`

The complete smart-arrow behavior is consolidated in `v2-heading-pro.js`:

- central arrow/movement state machine;
- raw, smoothed and displayed speed values;
- movement modes: `stationary`, `walking`, `running`, `vehicle_slow`, `vehicle`, `vehicle_fast`;
- multi-sample hysteresis so one noisy speed sample cannot change the mode;
- speed derived from GPS speed plus trusted displacement/time;
- stationary zero lock and spike protection;
- movement-aware speedometer and navigation HUD values;
- heading confidence score and calibration state;
- adaptive visual arrow/cone styling by movement mode;
- conservative visual route snap during active navigation only;
- different route-snap thresholds for walking/running and vehicle modes;
- predictive visual marker interpolation for running/vehicle modes, limited to 1.2 seconds;
- prediction disabled for stale/weak heading and never written into raw GPS state;
- movement-aware dynamic zoom while follow mode is active;
- manual zoom still disables follow; programmatic movement-mode zoom does not;
- session distance is accumulated only from plausible accepted movement samples;
- the existing `◎` control remains the only recenter/re-enable control, so no sixth phone action was added.

## Movement behavior
- `stationary`: compass leads, strong stabilization, zoom 18.
- `walking`: compass-led fusion, stable low-speed display, zoom 18.
- `running`: faster response and short visual prediction, zoom 17.
- `vehicle_slow`: GPS heading gains priority, route alignment allowed, zoom 17.
- `vehicle`: GPS heading and route direction lead, zoom 16.
- `vehicle_fast`: conservative wide-view follow, zoom 15.

These modes are estimates from browser GPS/sensors. They must not be presented as medical-grade activity recognition or guaranteed vehicle classification.

## Current deployment and CI
- Vercel status for code head `27c75e8c65db23027816a53a3daa883c85c5f0d2`: success.
- SmartCity parking smoke: success.
- SmartCity V2 smoke: success.
- SmartCity V2 browser acceptance was still in progress at the last check.
- Exact runtime checks for `/v2`, `/api/geocode`, `/api/overpass`, driving `/api/routing` and walking `/api/routing` must be repeated on the final exact head.

## Required physical acceptance
1. Fresh entry centers at zoom 18.
2. Manual zoom disables follow; `◎` restores it.
3. Stationary phone does not jitter or flip 180°.
4. Top edge of the phone and map arrow stay synchronized in portrait and landscape.
5. Walking does not jump into running/vehicle from one sample.
6. Running reacts faster without GPS-speed spikes.
7. Vehicle mode takes GPS heading priority and changes zoom only while follow is enabled.
8. Prediction stops immediately on stale GPS, stopping or weak confidence.
9. Route snap accepts a matching route and rejects a nearby road with conflicting direction.
10. Parking viewport refresh and the two main end-to-end flows remain intact.

## Remaining limitations
- Browser sensor quality depends on phone hardware, permissions, calibration and magnetic interference.
- Movement recognition is heuristic until validated with physical datasets.
- Leaflet road tiles do not yet rotate by bearing; the directional indicators rotate.
- Route snap is conservative visual alignment, not advanced probabilistic map matching.
- Voice and lane guidance are not implemented.

## Next safe batch
- Wait for browser acceptance on the exact code head.
- Recheck Preview runtime endpoints.
- Perform Android physical walk/run/vehicle acceptance and record failures by mode.
- Tune thresholds only from real test evidence, not by inventing accuracy.
- Keep PR #9 draft and `/app` untouched until acceptance succeeds.
