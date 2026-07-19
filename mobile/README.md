# ParkEyeRay Mobile

Native-first Android/iOS map application built with React Native and MapLibre Native.

## Product modes

- Explore: north-up map, free gestures, viewport parking loading.
- Follow: camera follows the user, north-up or heading-up.
- Navigation: heading-up camera, pitched map, route guidance and rerouting.

## Existing backend reused

- `GET /api/v2/parkings`
- `GET /api/v2/nearby`
- `GET /api/routing`
- `GET /api/geocode`
- parking proposals, evidence and SoulFlame moderation

## Mobile source layout

- `src/map` — MapLibre rendering and camera control
- `src/navigation` — follow modes and navigation state
- `src/sensors` — native GPS/compass fusion contract
- `src/services` — ParkEyeRay API clients
- `src/types.ts` — shared mobile contracts

The web V2 remains untouched and continues to be the browser/desktop fallback and moderation surface.
