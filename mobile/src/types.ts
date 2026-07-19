export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type CameraMode = 'explore' | 'follow-north' | 'follow-heading' | 'navigation';

export type SensorSnapshot = {
  coordinate: Coordinate;
  accuracyMeters: number;
  speedKmh: number;
  compassHeading: number | null;
  gpsHeading: number | null;
  displayHeading: number;
  headingSource: 'compass' | 'gps' | 'route' | 'fused' | 'unknown';
  confidence: number;
  timestamp: number;
};

export type ParkingFeature = {
  id: string;
  name: string | null;
  kind: string;
  point: { lat: number; lon: number };
  entrance: { lat: number; lon: number };
  distance: number;
  access: string | null;
  capacity: number | null;
  fee: string | null;
  covered: boolean | null;
  lit: boolean | null;
  surveillance: boolean | null;
  source: string;
  verificationStatus: string;
  dataOrigin: string;
  sourceUpdatedAt?: string | null;
  sourceRevision?: string | null;
  sourceRefs?: string[];
  tags?: Record<string, unknown>;
};

export type ParkingPreference = 'balanced' | 'nearest' | 'trusted' | 'free' | 'covered';
export type ParkingRisk = 'low' | 'medium' | 'high';

export type ParkingRecommendation = {
  parking: ParkingFeature;
  rank: number;
  suitabilityScore: number;
  dataConfidence: number;
  risk: ParkingRisk;
  distanceMeters: number;
  walkingMeters: number | null;
  reasons: string[];
  warnings: string[];
};

export type ParkingResponse = {
  parkings: ParkingFeature[];
  meta: {
    dataSource?: string;
    fallbackUsed?: boolean;
    radius?: number;
    resultCount?: number;
    liveOccupancy?: false;
  };
};
