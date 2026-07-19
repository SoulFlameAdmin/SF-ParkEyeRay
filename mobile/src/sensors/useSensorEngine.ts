import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { fuseHeading } from './headingFusion';
import type { SensorSnapshot } from '../types';

export type SensorEngineState = {
  sensor: SensorSnapshot | null;
  permission: 'unknown' | 'granted' | 'denied';
  error: string | null;
};

const initialState: SensorEngineState = {
  sensor: null,
  permission: 'unknown',
  error: null,
};

export function useSensorEngine(): SensorEngineState {
  const [state, setState] = useState(initialState);
  const compassRef = useRef<{ heading: number | null; accuracy: number }>({ heading: null, accuracy: 0 });
  const previousHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let locationSubscription: Location.LocationSubscription | null = null;
    let headingSubscription: Location.LocationSubscription | null = null;

    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (!permission.granted) {
        setState({ sensor: null, permission: 'denied', error: 'Location permission denied' });
        return;
      }

      setState((current) => ({ ...current, permission: 'granted', error: null }));

      headingSubscription = await Location.watchHeadingAsync((heading) => {
        const value = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
        compassRef.current = {
          heading: Number.isFinite(value) ? value : null,
          accuracy: Number.isFinite(heading.accuracy) ? heading.accuracy : 0,
        };
      });

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 350,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          if (!active) return;
          const speedKmh = Math.max(0, Number(location.coords.speed ?? 0) * 3.6);
          const gpsHeading = Number.isFinite(location.coords.heading) ? Number(location.coords.heading) : null;
          const fused = fuseHeading({
            compassHeading: compassRef.current.heading,
            compassAccuracy: compassRef.current.accuracy,
            gpsHeading,
            speedKmh,
            previousHeading: previousHeadingRef.current,
          });
          previousHeadingRef.current = fused.displayHeading;

          setState({
            permission: 'granted',
            error: null,
            sensor: {
              coordinate: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              },
              accuracyMeters: Math.max(0, Number(location.coords.accuracy ?? 0)),
              speedKmh,
              compassHeading: compassRef.current.heading,
              gpsHeading,
              displayHeading: fused.displayHeading,
              headingSource: fused.headingSource,
              confidence: fused.confidence,
              timestamp: location.timestamp,
            },
          });
        },
        (reason) => {
          if (active) setState((current) => ({ ...current, error: reason }));
        },
      );
    };

    start().catch((error: unknown) => {
      if (active) setState({ sensor: null, permission: 'denied', error: (error as Error).message });
    });

    return () => {
      active = false;
      locationSubscription?.remove();
      headingSubscription?.remove();
    };
  }, []);

  return state;
}
