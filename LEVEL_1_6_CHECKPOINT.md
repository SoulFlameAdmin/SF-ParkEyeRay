# SmartCity Mobility — Level 1.6 checkpoint

## Active development branch
`parkeyeray-level-1-6`

## Completed in current batch
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

## Verification completed
- Browser JavaScript syntax checked with `node --check` before commit.
- Serverless JavaScript syntax is checked in GitHub Actions.
- API contract test file: `tests/api-contract.mjs`.
- Vercel Preview build completed successfully for the previous application commit.
- Production branch was not overwritten by this batch.

## Current development commits
- `db4ea8a80c0e285dbbbefe4282d139b4c187409c` — add API contract checks.
- `c175c7efd813c10a5346c17429b1d74b32de647f` — execute API contract checks in CI.

## Next checks before production
1. Confirm the new GitHub Actions run succeeds with the API contract checks.
2. Confirm the Vercel Preview for the latest branch head reaches READY.
3. Fetch and exercise Preview `/app`, `/api/geocode`, `/api/overpass` and `/api/route`.
4. Test phone and desktop interaction, especially the bottom sheet and route card.
5. Add PWA manifest, icons, service worker and install flow.
6. Merge only after Preview acceptance.

## Known external limitations
- OpenStreetMap does not provide live parking occupancy by default.
- Live traffic-light phases require municipal or infrastructure-provider integration.
- Payments, native background BLE/NFC and municipal contracts are outside this browser-only batch.
