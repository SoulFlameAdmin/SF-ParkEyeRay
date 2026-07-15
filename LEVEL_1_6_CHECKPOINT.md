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
- PWA shell assets prepared: valid manifest, normal and maskable icons, service worker and honest offline fallback page.
- Installed PWA identity and start route corrected to `/app`, so installation will open the map rather than the onboarding page.
- Automated CI validation for the PWA manifest, icons, service worker syntax and offline fallback.
- Reusable Preview acceptance runner for onboarding, map app, honest data labels, PWA assets, PWA launch routing and invalid API input behavior.

## Verification completed
- Browser JavaScript syntax checked with `node --check` before commit.
- Serverless JavaScript syntax is checked in GitHub Actions.
- API contract test file: `tests/api-contract.mjs`.
- Preview acceptance runner: `tests/preview-acceptance.mjs`.
- GitHub Actions run 32 for commit `e716df870d85b91b255c07259c609fe0681fe505` completed successfully.
- Vercel Preview deployment `dpl_4W7JvNzhw6SsNMpxMQiSzB9Jkcwb` reached READY for the same commit.
- Preview manifest returned HTTP 200 with `id=/app`, `start_url=/app?source=pwa` and parking shortcut `/app?action=parking`.
- PR #2 remains open, draft and mergeable.
- Production branch was not overwritten by these batches.

## Current development commits
- `db4ea8a80c0e285dbbbefe4282d139b4c187409c` — add API contract checks.
- `c175c7efd813c10a5346c17429b1d74b32de647f` — execute API contract checks in CI.
- `509b1da2b382373eaabc98257e664f3ba645d1f3` — add PWA manifest.
- `a6d99a95bdb66c440a50981089dd1ea7f8df3460` — add primary PWA icon.
- `3cd254eb4091ca4b084b9e1c7d9df2d0c662b5b4` — add maskable PWA icon.
- `58f312caa3a5c28839180881d3c14615f2aa3af4` — add offline fallback page.
- `1a29a6613dd53f77fdeba5d8f3bc16e67e2ed697` — add service worker shell.
- `ee70c046b5f61d5138439f652d1d4a314df51260` — validate PWA assets in CI.
- `077317851177cd4b260fa0b8bc53f589cbbbf10f` — add reusable Preview acceptance runner.
- `5da933a13c1f7ac9fcbb18b72740518ac1fb47cc` — validate onboarding and map routes separately.
- `43055aa5e4f49f6365b4f548cde7d01efdfa6e73` — launch installed PWA directly into the map app.
- `e716df870d85b91b255c07259c609fe0681fe505` — verify PWA identity, start route and parking shortcut in Preview acceptance.

## Preview acceptance command
```bash
BASE_URL=https://<preview-host> node tests/preview-acceptance.mjs
```

The runner verifies `/`, `/app`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, invalid `/api/geocode` input and invalid `/api/route` input. It does not claim physical Android installation or human interaction testing.

## Next checks before production
1. Connect `manifest.webmanifest` and `sw.js` to the map HTML; service-worker registration is not yet claimed as active.
2. Add PNG 192×192 and 512×512 icons for strict cross-browser installability.
3. Run the complete Preview acceptance command against the exact latest deployment after HTML activation.
4. Verify browser installability and offline navigation on Android Chrome and desktop Chromium.
5. Test phone and desktop interaction, especially the bottom sheet, route card and all menu actions.
6. Inspect Preview runtime logs for serverless errors after route/geocode/parking usage.
7. Merge only after Preview acceptance and human interaction checks.

## Known external limitations
- OpenStreetMap does not provide live parking occupancy by default.
- Live traffic-light phases require municipal or infrastructure-provider integration.
- Payments, native background BLE/NFC and municipal contracts are outside this browser-only batch.
- SVG icons are present for the shell; PNG 192×192 and 512×512 icons are still required for strict cross-browser installability.
