import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, CircleLayer, Map, ShapeSource, SymbolLayer } from '@maplibre/maplibre-react-native';
import type { CameraMode, Coordinate, ParkingFeature, SensorSnapshot } from '../types';

const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

type Props = {
  sensor: SensorSnapshot | null;
  cameraMode: CameraMode;
  parkings: ParkingFeature[];
};

export function ParkEyeRayMap({ sensor, cameraMode, parkings }: Props) {
  const parkingCollection = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: parkings.map((parking) => ({
      type: 'Feature' as const,
      id: parking.id,
      properties: { id: parking.id, name: parking.name || 'Паркинг' },
      geometry: {
        type: 'Point' as const,
        coordinates: [parking.point.lon, parking.point.lat],
      },
    })),
  }), [parkings]);

  const userCoordinate: Coordinate = sensor?.coordinate ?? { latitude: 42.7339, longitude: 25.4858 };
  const followsUser = cameraMode !== 'explore' && sensor !== null;
  const headingUp = cameraMode === 'follow-heading' || cameraMode === 'navigation';

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MAP_STYLE} compassEnabled rotateEnabled pitchEnabled>
        <Camera
          centerCoordinate={[userCoordinate.longitude, userCoordinate.latitude]}
          zoomLevel={sensor ? (cameraMode === 'navigation' ? 16.8 : 16) : 7}
          heading={headingUp ? sensor?.displayHeading ?? 0 : 0}
          pitch={cameraMode === 'navigation' ? 52 : 0}
          animationDuration={followsUser ? 420 : 0}
        />

        <ShapeSource id="parkings" shape={parkingCollection}>
          <CircleLayer
            id="parking-circles"
            style={{
              circleRadius: 10,
              circleColor: '#2563eb',
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: 2,
            }}
          />
          <SymbolLayer
            id="parking-labels"
            style={{
              textField: 'P',
              textSize: 12,
              textColor: '#ffffff',
              textAllowOverlap: true,
            }}
          />
        </ShapeSource>

        {sensor && (
          <ShapeSource
            id="user-location"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [sensor.coordinate.longitude, sensor.coordinate.latitude],
              },
            }}
          >
            <CircleLayer
              id="user-location-core"
              style={{
                circleRadius: 9,
                circleColor: '#0f172a',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        )}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111f' },
  map: { flex: 1 },
});
