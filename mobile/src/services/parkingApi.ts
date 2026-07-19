import type { Coordinate, ParkingResponse } from '../types';

const DEFAULT_API_BASE = 'https://sf-parkeyeray.vercel.app';

export class ParkEyeRayApi {
  constructor(private readonly baseUrl = DEFAULT_API_BASE) {}

  async parkings(center: Coordinate, radius = 1000, signal?: AbortSignal): Promise<ParkingResponse> {
    const params = new URLSearchParams({
      lat: String(center.latitude),
      lon: String(center.longitude),
      radius: String(radius),
      limit: '150',
    });
    const response = await fetch(`${this.baseUrl}/api/v2/parkings?${params}`, { signal });
    const payload = (await response.json()) as ParkingResponse & { error?: string };
    if (!response.ok || !Array.isArray(payload.parkings)) {
      throw new Error(payload.error || `parking_api_${response.status}`);
    }
    return payload;
  }
}
