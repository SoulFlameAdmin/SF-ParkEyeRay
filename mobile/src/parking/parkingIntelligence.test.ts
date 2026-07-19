import assert from 'node:assert/strict';
import test from 'node:test';
import { rankParkings } from './parkingIntelligence';
import type { ParkingFeature } from '../types';

const parking = (overrides: Partial<ParkingFeature> & Pick<ParkingFeature, 'id'>): ParkingFeature => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  kind: overrides.kind ?? 'surface',
  point: overrides.point ?? { lat: 42.7339, lon: 25.4858 },
  entrance: overrides.entrance ?? overrides.point ?? { lat: 42.7339, lon: 25.4858 },
  distance: overrides.distance ?? 300,
  access: overrides.access ?? 'public',
  capacity: overrides.capacity ?? 30,
  fee: overrides.fee ?? null,
  covered: overrides.covered ?? false,
  lit: overrides.lit ?? true,
  surveillance: overrides.surveillance ?? null,
  source: overrides.source ?? 'osm',
  verificationStatus: overrides.verificationStatus ?? 'mapped',
  dataOrigin: overrides.dataOrigin ?? 'postgis',
  sourceUpdatedAt: overrides.sourceUpdatedAt ?? new Date().toISOString(),
  sourceRevision: overrides.sourceRevision ?? null,
  sourceRefs: overrides.sourceRefs ?? [],
  tags: overrides.tags ?? {},
});

test('trusted preference can prefer verified data over a closer fallback record', () => {
  const result = rankParkings([
    parking({ id: 'fallback-close', distance: 70, access: null, dataOrigin: 'overpass-fallback', sourceUpdatedAt: null }),
    parking({ id: 'soulflame-approved', distance: 520, source: 'soulflame', verificationStatus: 'approved', capacity: 80 }),
  ], { preference: 'trusted' });

  assert.equal(result[0]?.parking.id, 'soulflame-approved');
  assert.ok((result[0]?.dataConfidence ?? 0) > (result[1]?.dataConfidence ?? 0));
});

test('private access is never presented as a low-risk recommendation', () => {
  const [result] = rankParkings([
    parking({ id: 'private', distance: 25, access: 'private', source: 'soulflame', verificationStatus: 'approved' }),
  ]);

  assert.equal(result?.risk, 'high');
  assert.ok(result?.warnings.some((warning) => warning.toLowerCase().includes('частен')));
  assert.ok((result?.suitabilityScore ?? 100) < 70);
});

test('free preference rewards an explicitly free parking', () => {
  const result = rankParkings([
    parking({ id: 'paid', distance: 180, fee: 'yes' }),
    parking({ id: 'free', distance: 190, fee: 'no' }),
  ], { preference: 'free' });

  assert.equal(result[0]?.parking.id, 'free');
  assert.ok(result[0]?.reasons.some((reason) => reason.includes('безплатен')));
});

test('ranking is deterministic and keeps scores in a transparent 0-100 range', () => {
  const input = [
    parking({ id: 'b', distance: 200 }),
    parking({ id: 'a', distance: 200 }),
  ];
  const first = rankParkings(input);
  const second = rankParkings(input);

  assert.deepEqual(first.map((item) => item.parking.id), second.map((item) => item.parking.id));
  assert.ok(first.every((item) => item.suitabilityScore >= 0 && item.suitabilityScore <= 100));
  assert.ok(first.every((item) => item.dataConfidence >= 0 && item.dataConfidence <= 100));
});
