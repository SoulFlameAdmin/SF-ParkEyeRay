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

## Verification completed
- Browser JavaScript syntax checked with `node --check` before commit.
- Vercel Preview build completed successfully.
- Production branch was not overwritten by this batch.

## Next checks before production
1. Fetch and exercise Preview `/app`, `/api/geocode`, `/api/overpass` and `/api/route`.
2. Test phone and desktop interaction, especially the bottom sheet and route card.
3. Fix any runtime errors or routing-provider incompatibilities.
4. Add PWA manifest/service worker and automated smoke tests.
5. Merge only after Preview acceptance.
