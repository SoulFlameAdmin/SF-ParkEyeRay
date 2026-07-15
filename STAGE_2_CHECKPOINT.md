# SmartCity V2 — Stage 2 checkpoint

## Scope
Search and destinations that work with Bulgarian Cyrillic, Latin transliteration, multiple similarly named results, recent history and saved places.

## Implemented
- Debounced live suggestions after three entered characters.
- Full submit search remains available and cancels stale suggestion requests.
- Search result ranking uses normalized query, object type, matching city/name tokens, source quality and distance.
- Mall searches rank the actual mall above a nearby parking feature with a similar name.
- Result rows show object type and location context to distinguish identical names in different cities.
- Selected destinations are stored in a bounded local history of 20 entries.
- Destinations can be saved or removed through the star control in the parking panel.
- Saved and recent destinations appear when the search field is focused.
- Search history can be cleared independently.
- The full local privacy reset removes parking saves, destination saves, destination history and proposals.
- Search suggestions maintain `aria-expanded`, listbox and option semantics.

## Automated acceptance
The Playwright suite runs on an Android Pixel 7 profile and desktop Chromium. It verifies:
- destination search → parking list → selected parking → driving and walking route;
- `qmbol mol` response normalized to `ямбол мол` ranks the mall above its parking;
- destination history is written;
- saved destination state is written and survives reload;
- saved and recent sections appear after reload;
- drawing → pending SoulFlame proposal;
- drawing cancellation and offline → online recovery.

## Verification
- SmartCity V2 browser acceptance: success.
- SmartCity V2 smoke: success.
- Existing SmartCity parking smoke: success.
- Vercel branch Preview: READY.
- Preview serves `v2-destinations.js` with ranking, history and saved-place code.

## Safety
- Existing production `/app` is unchanged.
- V2 remains available only through `/v2` on draft PR #6.
- Search history and saves are local-only until authenticated account sync is implemented.
- Selecting a destination still loads OSM-mapped parking data, not live vacancy.

## Next stage
Stage 3 — parking data engine:
1. import and query OSM parking areas, spaces, street parking and entrances from PostGIS;
2. combine approved SoulFlame parking zones;
3. deduplicate overlapping sources;
4. return stable spatial results without relying on a public Overpass request for every click;
5. keep clear source and freshness labels.
