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
- Automated CI validation for the PWA manifest, icons, service worker syntax and offline fallback.
- Reusable Preview acceptance runner for homepage, honest data labels, PWA assets and invalid API input behavior.

## Verification completed
- Browser JavaScript syntax checked with `node --check` before commit.
- Serverless JavaScript syntax is checked in GitHub Actions.
- API contract test file: `tests/api-contract.mjs`.
- Preview acceptance runner: `tests/preview-acceptance.mjs`.
- Latest verified GitHub Actions run before this batch completed successfully.
- Vercel Preview reached READY for the previous branch head.
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

## Preview acceptance command
```bash
BASE_URL=https://<preview-host> node tests/preview-acceptance.mjs
```

The runner verifies `/`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, invalid `/api/geocode` input and invalid `/api/route` input. It does not claim physical Android installation or human interaction testing.

## Next checks before production
1. Confirm the GitHub Actions run succeeds for the latest branch head.
2. Confirm the Vercel Preview for the latest branch head reaches READY.
3. Run `tests/preview-acceptance.mjs` against that exact Preview deployment.
4. Connect `manifest.webmanifest` and `sw.js` to the main HTML; this is not yet claimed as an active install flow.
5. Add PNG 192×192 and 512×512 icons for strict cross-browser installability.
6. Verify browser installability and offline navigation on Android Chrome and desktop Chromium.
7. Test phone and desktop interaction, especially the bottom sheet and route card.
8. Merge only after Preview acceptance.

## Known external limitations
- OpenStreetMap does not provide live parking occupancy by default.
- Live traffic-light phases require municipal or infrastructure-provider integration.
- Payments, native background BLE/NFC and municipal contracts are outside this browser-only batch.
- SVG icons are present for the shell; PNG 192×192 and 512×512 icons are still required for strict cross-browser installability.
