# SmartCity Mobility — Level 1.6 checkpoint

## Active development branch
`parkeyeray-level-1-6`

## Completed in current batches
- Responsive desktop right panel and mobile bottom results sheet.
- Destination-first parking discovery with adaptive 500 m, 1 km, 2 km and 5 km radius.
- Search suggestions through the Bulgarian geocoding API.
- Parking ranking and filters without pretending that live occupancy exists.
- Driving and walking routing API with fallback estimates.
- Real route drawing for the selected parking.
- Vehicle profile and fuel/energy cost calculation.
- Saved parking places and destination history stored locally.
- Optional OpenStreetMap traffic-signal location layer; live signal state is explicitly unavailable.
- Local-only test road reports with a clear non-live label.
- AI Mobility OS shown as locked until backend, identity, consent and AI data requirements are met.
- Automated serverless API contract tests for method restrictions, invalid input and routing fallback behavior.
- PWA manifest, normal/maskable SVG icons, service worker and honest offline fallback page.
- Installed PWA identity and start route point to `/app`.
- Automated CI validation for PWA assets, API contracts and UI actions.
- Reusable Preview acceptance runner for onboarding, map, honest data labels, PWA assets and invalid API input behavior.
- Service-worker shell includes `/app`; API calls remain network-only and return an explicit non-cached HTTP 503 response while offline.
- Onboarding links `manifest.webmanifest` and loads `/pwa-register.js`.
- `/pwa-register.js` safely registers `/sw.js` with application-wide scope and does not break unsupported browsers.
- PWA lifecycle captures `beforeinstallprompt`, exposes an explicit install API, reports unavailable/dismissed/already-installed states honestly and detects waiting service-worker updates.
- Service-worker update activation is explicit through a `SKIP_WAITING` message; it is not triggered silently.
- Preview acceptance verifies manifest wiring, registration, install lifecycle, update detection and honest unavailable-state behavior.
- Onboarding copy clearly marks Google login and CarTag/NFC detection as demonstrations rather than production integrations.

## Verification status
- Browser and serverless JavaScript syntax are checked in CI.
- API contract test: `tests/api-contract.mjs`.
- UI action contract: `tests/ui-contract.mjs`.
- Preview acceptance runner: `tests/preview-acceptance.mjs`.
- GitHub Actions run 60 passed on checkpoint commit `2c6e6b3c81efe5244be6fed1d453d8db64b3a02e`.
- Exact Vercel Preview deployment `dpl_2GmfzyeM6rd1qW7bxwpdK2fnnLGa` for that commit is `READY`.
- Delivered `/pwa-register.js` was fetched from that exact Preview with HTTP 200 and contains the install/update lifecycle implementation.
- The complete browser-side install prompt, standalone launch and offline session remain unverified because they require a real Chromium browser/device interaction.
- PR #2 must remain draft until PNG icons and human phone/desktop interaction checks pass.
- Production `main` remains unchanged.

## Latest development commits
- `c12b4f4009764be966f52f224cc21bf1880dc1e4` — add safe service-worker registration module.
- `52a6afdb3056e72260abb3f1b9b33358fa7936b6` — activate manifest and service worker from onboarding.
- `291749701d525678d20f27e30f39ea51dc4479b2` — verify active PWA registration in Preview acceptance.
- `cd7d043ba2a81fbe4c8b412697ef0e80eb4fb876` — checkpoint the accepted PWA activation batch.
- `aabb0487f0849074a0029a398b327348dcc26b64` — add honest PWA install and update lifecycle handling.
- `5d575b28ad9ee1749620f94e5ddac0188a673bc9` — verify PWA install and update lifecycle contract.
- `2c6e6b3c81efe5244be6fed1d453d8db64b3a02e` — checkpoint the PWA install lifecycle batch.

## Preview acceptance command
```bash
BASE_URL=https://<preview-host> node tests/preview-acceptance.mjs
```

The runner verifies `/`, `/pwa-register.js`, `/app`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, invalid `/api/geocode` input and invalid `/api/route` input. Static checks prove that registration and install/update lifecycle handling are wired into delivered JavaScript, but they do not prove a physical browser installation, service-worker lifecycle or offline navigation session.

## Next checks before production
1. Add real PNG 192×192 and 512×512 icons for strict Android/Chromium installability.
2. Connect the exposed PWA install state to a visible product control without showing a dead install button when the native prompt is unavailable.
3. Run the complete Preview acceptance command against the exact newest Preview after the next functional batch.
4. Verify install prompt, standalone launch and offline navigation on Android Chrome and desktop Chromium.
5. Test phone and desktop interaction, especially bottom sheet, route card and all menu actions.
6. Inspect Preview runtime logs after route/geocode/parking usage.
7. Merge only after Preview acceptance and human interaction checks.

## Known external limitations
- OpenStreetMap does not provide live parking occupancy by default.
- Live traffic-light phases require municipal or infrastructure-provider integration.
- Payments require a payment provider, merchant account and legal/commercial setup.
- Native background BLE/NFC requires a native mobile layer, hardware validation and permission testing.
- Municipal live data and operational deployment require contracts and data access agreements.
- SVG icons are present; PNG 192×192 and 512×512 assets are still required for strict cross-browser installability.
- A physical Android/desktop Chromium installation test requires a real browser/device session.