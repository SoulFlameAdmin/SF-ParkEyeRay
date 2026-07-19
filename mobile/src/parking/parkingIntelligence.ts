import type {
  Coordinate,
  ParkingFeature,
  ParkingPreference,
  ParkingRecommendation,
  ParkingRisk,
} from '../types';

type ParkingContext = {
  preference?: ParkingPreference;
  destination?: Coordinate | null;
};

type ScoreWeights = {
  distance: number;
  trust: number;
  access: number;
  capacity: number;
  amenities: number;
  preference: number;
};

const WEIGHTS: Record<ParkingPreference, ScoreWeights> = {
  balanced: { distance: 0.34, trust: 0.24, access: 0.2, capacity: 0.1, amenities: 0.08, preference: 0.04 },
  nearest: { distance: 0.58, trust: 0.14, access: 0.16, capacity: 0.05, amenities: 0.04, preference: 0.03 },
  trusted: { distance: 0.2, trust: 0.46, access: 0.18, capacity: 0.07, amenities: 0.06, preference: 0.03 },
  free: { distance: 0.28, trust: 0.18, access: 0.17, capacity: 0.07, amenities: 0.05, preference: 0.25 },
  covered: { distance: 0.25, trust: 0.19, access: 0.16, capacity: 0.07, amenities: 0.08, preference: 0.25 },
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const normalizeText = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function sourceTrust(parking: ParkingFeature): number {
  const source = normalizeText(parking.source);
  const status = normalizeText(parking.verificationStatus);
  const origin = normalizeText(parking.dataOrigin);

  if (source === 'soulflame' && status === 'approved') return 98;
  if (source === 'municipality') return 94;
  if (source === 'operator') return 86;
  if (origin === 'postgis') return status === 'approved' ? 88 : 78;
  if (source === 'osm' && origin !== 'overpass-fallback') return 68;
  if (origin === 'overpass-fallback') return 54;
  return 58;
}

function freshnessScore(parking: ParkingFeature): number {
  const timestamp = Date.parse(parking.sourceUpdatedAt ?? '');
  if (!Number.isFinite(timestamp)) return 48;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
  if (ageDays <= 7) return 100;
  if (ageDays <= 30) return 90;
  if (ageDays <= 180) return 74;
  if (ageDays <= 365) return 58;
  return 42;
}

function completenessScore(parking: ParkingFeature): number {
  const values = [
    parking.name,
    parking.access,
    parking.capacity,
    parking.fee,
    parking.covered,
    parking.lit,
    parking.surveillance,
    parking.entrance?.lat,
    parking.entrance?.lon,
  ];
  const known = values.filter((value) => value !== null && value !== undefined && value !== '').length;
  return clamp(28 + known / values.length * 72);
}

function dataConfidence(parking: ParkingFeature): number {
  return Math.round(clamp(sourceTrust(parking) * 0.62 + freshnessScore(parking) * 0.2 + completenessScore(parking) * 0.18));
}

function accessScore(parking: ParkingFeature): { score: number; risk: ParkingRisk; warning?: string } {
  const access = normalizeText(parking.access);
  if (!access || ['yes', 'public', 'permissive', 'designated'].includes(access)) {
    return access ? { score: 100, risk: 'low' } : { score: 64, risk: 'medium', warning: 'Достъпът не е описан' };
  }
  if (['customers', 'customer'].includes(access)) return { score: 48, risk: 'medium', warning: 'Възможно е да е само за клиенти' };
  if (['residents', 'resident'].includes(access)) return { score: 28, risk: 'high', warning: 'Възможно е да е само за живущи' };
  if (['permit', 'destination'].includes(access)) return { score: 22, risk: 'high', warning: 'Възможно е да изисква разрешение' };
  if (['private', 'no'].includes(access)) return { score: 4, risk: 'high', warning: 'Отбелязан е ограничен или частен достъп' };
  return { score: 52, risk: 'medium', warning: `Неясен достъп: ${parking.access}` };
}

function distanceScore(distance: number): number {
  if (distance <= 120) return 100;
  if (distance <= 300) return 92 - (distance - 120) / 22;
  if (distance <= 1000) return 84 - (distance - 300) / 14;
  if (distance <= 3000) return 34 - (distance - 1000) / 100;
  return 8;
}

function capacityScore(capacity: number | null): number {
  if (capacity === null || !Number.isFinite(capacity)) return 50;
  if (capacity >= 150) return 100;
  if (capacity >= 80) return 90;
  if (capacity >= 40) return 80;
  if (capacity >= 15) return 66;
  if (capacity >= 5) return 54;
  return 42;
}

function amenityScore(parking: ParkingFeature): number {
  let score = 46;
  if (parking.lit === true) score += 18;
  if (parking.surveillance === true) score += 18;
  if (parking.covered === true) score += 18;
  if (parking.lit === false) score -= 8;
  return clamp(score);
}

function preferenceScore(parking: ParkingFeature, preference: ParkingPreference): number {
  if (preference === 'free') {
    const fee = normalizeText(parking.fee);
    if (['no', 'false', '0'].includes(fee)) return 100;
    if (!fee) return 48;
    return 12;
  }
  if (preference === 'covered') return parking.covered === true ? 100 : parking.covered === false ? 10 : 45;
  if (preference === 'trusted') return sourceTrust(parking);
  if (preference === 'nearest') return distanceScore(parking.distance);
  return 60;
}

function reasonList(
  parking: ParkingFeature,
  confidence: number,
  distance: number,
  preference: ParkingPreference,
): string[] {
  const reasons: string[] = [];
  const access = normalizeText(parking.access);
  const fee = normalizeText(parking.fee);
  const add = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (preference === 'free' && ['no', 'false', '0'].includes(fee)) add('отбелязан като безплатен');
  if (preference === 'covered' && parking.covered === true) add('закрит');
  if (preference === 'trusted' && confidence >= 74) add('надеждни данни');
  if (preference === 'nearest' && distance <= 700) add(distance <= 250 ? 'много близо' : 'близо до теб');

  if (distance <= 250) add('много близо');
  else if (distance <= 700) add('близо до теб');
  if (confidence >= 84) add('надеждни данни');
  if (parking.source === 'soulflame' && normalizeText(parking.verificationStatus) === 'approved') add('одобрен от SoulFlame');
  if (['yes', 'public', 'permissive', 'designated'].includes(access)) add('обществен достъп');
  if (['no', 'false', '0'].includes(fee)) add('отбелязан като безплатен');
  if (parking.covered === true) add('закрит');
  if (parking.lit === true) add('осветен');
  if (parking.surveillance === true) add('наблюдение');
  if ((parking.capacity ?? 0) >= 40) add('по-голям капацитет');

  return reasons.slice(0, 3);
}

function recommendationFor(parking: ParkingFeature, context: ParkingContext): ParkingRecommendation {
  const preference = context.preference ?? 'balanced';
  const weights = WEIGHTS[preference];
  const distance = Math.max(0, Number(parking.distance || 0));
  const confidence = dataConfidence(parking);
  const access = accessScore(parking);
  const walkingMeters = context.destination
    ? Math.round(distanceMeters(
        { latitude: parking.entrance.lat, longitude: parking.entrance.lon },
        context.destination,
      ))
    : null;
  const effectiveDistance = walkingMeters === null ? distance : distance * 0.58 + walkingMeters * 0.42;

  let score =
    distanceScore(effectiveDistance) * weights.distance +
    confidence * weights.trust +
    access.score * weights.access +
    capacityScore(parking.capacity) * weights.capacity +
    amenityScore(parking) * weights.amenities +
    preferenceScore(parking, preference) * weights.preference;

  if (access.risk === 'high') score -= 18;
  if (confidence < 40) score -= 10;

  const warnings = [access.warning].filter((value): value is string => Boolean(value));
  if (confidence < 55) warnings.push('Данните са с ограничена надеждност');
  if (parking.dataOrigin === 'overpass-fallback') warnings.push('Картографски източник без потвърждение на място');

  return {
    parking,
    rank: 0,
    suitabilityScore: Math.round(clamp(score)),
    dataConfidence: confidence,
    risk: access.risk === 'high' || confidence < 36 ? 'high' : access.risk === 'medium' || confidence < 62 ? 'medium' : 'low',
    distanceMeters: Math.round(distance),
    walkingMeters,
    reasons: reasonList(parking, confidence, distance, preference),
    warnings: [...new Set(warnings)].slice(0, 2),
  };
}

export function rankParkings(parkings: ParkingFeature[], context: ParkingContext = {}): ParkingRecommendation[] {
  return parkings
    .map((parking) => recommendationFor(parking, context))
    .sort((a, b) =>
      b.suitabilityScore - a.suitabilityScore ||
      b.dataConfidence - a.dataConfidence ||
      a.distanceMeters - b.distanceMeters ||
      a.parking.id.localeCompare(b.parking.id),
    )
    .map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));
}

export function preferenceLabel(preference: ParkingPreference): string {
  return ({ balanced: 'Баланс', nearest: 'Най-близо', trusted: 'Най-надеждно', free: 'Безплатно', covered: 'Закрито' })[preference];
}

export function formatParkingDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} км` : `${Math.round(meters)} м`;
}
