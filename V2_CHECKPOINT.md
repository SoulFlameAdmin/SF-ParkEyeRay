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

`v2-heading-pro.js` now adds:

- rolling median filtering over recent trusted speed samples;
- confidence-weighted fusion between browser GPS speed and displacement/time speed;
- adaptive acceleration/deceleration limits that reject low-confidence jumps;
- stronger stationary zero lock based on displacement, reported speed and GPS accuracy;
- mode-specific hysteresis bands to stop walking/running/vehicle oscillation near thresholds;
- separate raw, smoothed, target and visually displayed speed values;
- requestAnimationFrame speed interpolation for a live meter without numeric jumping;
- decimal speed during walking/running and integer speed during vehicle modes;
- speed confidence, acceleration and braking states exposed to the meter;
- stale GPS decay toward zero instead of leaving an old speed frozen;
- route-snap enter/exit hysteresis requiring repeated agreement or disagreement;
- route snap also requires speed confidence, heading confidence and direction agreement;
- shorter confidence-limited prediction horizon and immediate rejection on stale fixes;
- dynamic zoom only after the movement mode has remained stable;
- plausible session-distance accumulation only from trusted movement samples;
- no raw GPS coordinate is replaced by prediction or route snap.

## Movement behavior
- `stationary`: compass leads, strongest zero lock and stabilization, zoom 18.
- `walking`: stable decimal speed and compass-led fusion, zoom 18.
- `running`: faster response with limited prediction, zoom 17.
- `vehicle_slow`: GPS heading gains priority and route alignment is allowed, zoom 17.
- `vehicle`: GPS heading and route direction lead, zoom 16.
- `vehicle_fast`: conservative wide-view follow, zoom 15.

These modes remain browser-sensor estimates, not guaranteed transport classification.

## Current deployment and CI
- Exact head `81208fe1f1769227753a3055352c47ea3a5aa3bd` was pushed successfully.
- GitHub smoke and browser workflows started for the exact head.
- Vercel Git deployment for the exact head is currently blocked by the account daily free deployment limit, not by a confirmed application build failure.
- The previous exact deployment `683893b7c756b5540bf78cb241f1372405df572e` remains READY.
- Runtime endpoint acceptance must be repeated after Vercel can publish the new exact head.

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
11. Parking viewport refresh and both main end-to-end flows remain intact.

## Remaining limitations
- Browser sensor quality depends on phone hardware, permissions, calibration and magnetic interference.
- Movement recognition is heuristic until validated with physical datasets.
- Leaflet road tiles do not yet rotate by bearing; the directional indicators rotate.
- Route snap is conservative visual alignment, not advanced probabilistic map matching.
- Voice and lane guidance are not implemented.

## Next safe batch
- Wait for exact-head GitHub workflows to complete.
- Publish and verify an exact-head Vercel Preview when the deployment quota permits.
- Recheck `/v2`, `/api/geocode`, `/api/overpass`, driving and walking `/api/routing`.
- Perform Android walk/run/vehicle acceptance and record mode-specific failures.
- Keep PR #9 draft and `/app` untouched until acceptance succeeds.
