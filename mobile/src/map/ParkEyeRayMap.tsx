import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import type { CameraMode, Coordinate, ParkingFeature, SensorSnapshot } from '../types';

const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';
const DEFAULT_CENTER: Coordinate = { latitude: 42.7339, longitude: 25.4858 };

type Props = {
  sensor: SensorSnapshot | null;
  cameraMode: CameraMode;
  parkings: ParkingFeature[];
};

export function ParkEyeRayMap({ sensor, cameraMode, parkings }: Props) {
  const parkingCollection = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: parkings.map((parking) => ({
        type: 'Feature',
        id: parking.id,
        properties: { id: parking.id, name: parking.name || 'Паркинг' },
        geometry: {
          type: 'Point',
          coordinates: [parking.point.lon, parking.point.lat],
        },
      })),
    }),
    [parkings],
  );

  const userCollection = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: sensor
        ? [
            {
              type: 'Feature',
              properties: {
                heading: sensor.displayHeading,
                confidence: sensor.confidence,
                source: sensor.headingSource,
              },
              geometry: {
                type: 'Point',
                coordinates: [sensor.coordinate.longitude, sensor.coordinate.latitude],
              },
            },
          ]
        : [],
    }),
    [sensor],
  );

  const userCoordinate = sensor?.coordinate ?? DEFAULT_CENTER;
  const followsUser = cameraMode !== 'explore' && sensor !== null;
  const headingUp = cameraMode === 'follow-heading' || cameraMode === 'navigation';
  const zoom = sensor ? (cameraMode === 'navigation' ? 16.8 : 16) : 7;
  const bearing = headingUp ? sensor?.displayHeading ?? 0 : 0;
  const pitch = cameraMode === 'navigation' ? 52 : 0;

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE}
        compass
        compassHiddenFacingNorth={false}
        touchRotate
        touchPitch
        attribution
        logo
      >
        <Camera
          center={[userCoordinate.longitude, userCoordinate.latitude]}
          zoom={zoom}
          bearing={bearing}
          pitch={pitch}
          duration={followsUser ? 420 : 0}
          easing={followsUser ? 'ease' : undefined}
        />

        <GeoJSONSource id="parkings" data={parkingCollection}>
          <Layer
            id="parking-circles"
            type="circle"
            source="parkings"
            paint={{
              'circle-radius': 10,
              'circle-color': '#2563eb',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="parking-labels"
            type="symbol"
            source="parkings"
            layout={{
              'text-field': 'P',
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="user-location" data={userCollection}>
          <Layer
            id="user-location-accuracy"
            type="circle"
            source="user-location"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 7, 18, 18],
              'circle-color': '#3b82f6',
              'circle-opacity': 0.16,
              'circle-stroke-color': '#60a5fa',
              'circle-stroke-opacity': 0.36,
              'circle-stroke-width': 1,
            }}
          />
          <Layer
            id="user-location-core"
            type="circle"
            source="user-location"
            paint={{
              'circle-radius': 9,
              'circle-color': '#0f172a',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111f' },
  map: { flex: 1 },
});
