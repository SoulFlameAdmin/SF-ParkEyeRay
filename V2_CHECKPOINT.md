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

- central arrow/movement state machine;
- movement modes: `stationary`, `walking`, `running`, `vehicle_slow`, `vehicle`, `vehicle_fast`;
- GPS speed plus displacement/time fusion;
- stationary zero lock, spike protection and movement hysteresis;
- heading confidence, adaptive arrow styling, route snap, short prediction and dynamic zoom;
- existing `◎` remains the only recenter/re-enable control.

## Live accuracy and stability upgrade — batch 8
Head code commit: `81208fe1f1769227753a3055352c47ea3a5aa3bd`

- rolling median speed filtering and confidence-weighted GPS/displacement fusion;
- acceleration/deceleration limits, stationary zero lock and movement hysteresis;
- smooth requestAnimationFrame speed rendering;
- stale GPS decay, route-snap hysteresis, short prediction and trusted session distance.

## Preview root entry — batch 9
- On branch Preview only, opening `/` redirects directly to `/v2?skipOnboarding=1`.
- This does not replace production `/app` and does not merge PR #9.

## Navigation Intelligence — batch 10
Code commit: `7375ba51841f9659d4d58e2c4831fd8802e5d642`

- live `Navigation Health` score from GPS accuracy, fix freshness, heading confidence, speed confidence and route state;
- separate GPS, freshness, speed, heading and route health values;
- live session distance, moving time, average speed and maximum speed;
- pace in `min/km` for walking and running;
- compact phone-first health card without adding a sixth primary action;
- developer diagnostics via `?debug=1` with GPS age, accuracy, mode, confidence, speed, acceleration, route snap, prediction and FPS;
- public `navigationHealth()` and `sessionMetrics()` runtime APIs for tests and future UI;
- health values represent browser sensor confidence only and do not claim hardware-grade certainty.

## Parking refresh stabilization — batch 11
Code commit: `ca935e6c5b7d2e37e40545384926a425f82821a0`

- viewport parking uses a small prefetch buffer to avoid marker pop-in on screen edges;
- a late viewport request can no longer overwrite active destination parking results;
- GPS follow, moveend and zoomend refreshes pause while destination parking context is active;
- toggling the parking layer during a destination flow restores destination results instead of switching context;
- the fix preserves the live visible-area behavior and does not claim live occupancy.

## Movement behavior
- `stationary`: compass leads, strongest zero lock and stabilization, zoom 18.
- `walking`: stable decimal speed and compass-led fusion, zoom 18.
- `running`: faster response with limited prediction, zoom 17.
- `vehicle_slow`: GPS heading gains priority and route alignment is allowed, zoom 17.
- `vehicle`: GPS heading and route direction lead, zoom 16.
- `vehicle_fast`: conservative wide-view follow, zoom 15.

These modes remain browser-sensor estimates, not guaranteed transport classification.

## Current deployment and CI
- Navigation Intelligence Preview became READY.
- SmartCity V2 smoke and parking smoke passed for batch 10.
- Browser acceptance exposed a real parking refresh race: expected destination results were replaced by viewport results.
- Batch 11 fixes that race and this checkpoint commit intentionally triggers one fresh CI and Preview cycle.
- Deployment discipline remains: code commits may use `[skip ci]`; the completed checkpoint commit triggers the single deployment.

## Required physical acceptance
1. Fresh entry centers at zoom 18.
2. Manual zoom disables follow; `◎` restores it.
3. Stationary phone remains at 0 and does not jitter or flip.
4. Phone top edge and arrow stay synchronized in portrait and landscape.
5. Walking speed is smooth and does not jump into running/vehicle.
6. Running responds faster without one-sample spikes.
7. Vehicle acceleration/braking feels live without impossible jumps.
8. Stale GPS makes displayed speed decay instead of freeze.
9. Prediction stops on stale GPS, stopping or weak confidence.
10. Route snap enters and exits without rapid flicker.
11. Navigation Health reacts sensibly to weak GPS and stale fixes.
12. Session distance, average, max and pace remain plausible.
13. Parking viewport refresh and both main end-to-end flows remain intact.

## Remaining limitations
- Browser sensor quality depends on phone hardware, permissions, calibration and magnetic interference.
- Movement recognition is heuristic until validated with physical datasets.
- Leaflet road tiles do not yet rotate by bearing; the directional indicators rotate.
- Route snap is conservative visual alignment, not advanced probabilistic map matching.
- Voice and lane guidance are not implemented.

## Next safe batch
- Confirm CI and exact-head Preview after batch 11.
- Recheck `/v2`, `/api/geocode`, `/api/overpass`, driving and walking `/api/routing`.
- Perform Android walk/run/vehicle acceptance and record mode-specific failures.
- Tune only from real device evidence.
- Keep PR #9 draft and `/app` untouched until acceptance succeeds.