import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import type { CameraMode, Coordinate, ParkingFeature, ParkingRecommendation, SensorSnapshot } from '../types';

const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';
const DEFAULT_CENTER: Coordinate = { latitude: 42.7339, longitude: 25.4858 };

type Props = {
  sensor: SensorSnapshot | null;
  cameraMode: CameraMode;
  parkings: ParkingFeature[];
  recommendations: ParkingRecommendation[];
  selectedParking: ParkingFeature | null;
};

const pointFeature = (parking: ParkingFeature, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<GeoJSON.Point> => ({
  type: 'Feature',
  id: parking.id,
  properties: { id: parking.id, name: parking.name || 'Паркинг', ...properties },
  geometry: {
    type: 'Point',
    coordinates: [parking.point.lon, parking.point.lat],
  },
});

export function ParkEyeRayMap({ sensor, cameraMode, parkings, recommendations, selectedParking }: Props) {
  const parkingCollection = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: parkings.map((parking) => pointFeature(parking)),
    }),
    [parkings],
  );

  const recommendationCollection = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: recommendations.map((item) => pointFeature(item.parking, {
        rank: item.rank,
        rankLabel: String(item.rank),
        suitability: item.suitabilityScore,
        confidence: item.dataConfidence,
      })),
    }),
    [recommendations],
  );

  const selectedCollection = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: selectedParking ? [pointFeature(selectedParking, { selected: true })] : [],
    }),
    [selectedParking],
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
  const cameraCoordinate = selectedParking
    ? { latitude: selectedParking.entrance.lat, longitude: selectedParking.entrance.lon }
    : userCoordinate;
  const followsUser = cameraMode !== 'explore' && sensor !== null && selectedParking === null;
  const headingUp = cameraMode === 'follow-heading' || cameraMode === 'navigation';
  const zoom = selectedParking ? 17.2 : sensor ? (cameraMode === 'navigation' ? 16.8 : 16) : 7;
  const bearing = selectedParking ? 0 : headingUp ? sensor?.displayHeading ?? 0 : 0;
  const pitch = selectedParking ? 28 : cameraMode === 'navigation' ? 52 : 0;

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
          center={[cameraCoordinate.longitude, cameraCoordinate.latitude]}
          zoom={zoom}
          bearing={bearing}
          pitch={pitch}
          duration={followsUser || selectedParking ? 420 : 0}
          easing={followsUser || selectedParking ? 'ease' : undefined}
        />

        <GeoJSONSource id="parkings" data={parkingCollection}>
          <Layer
            id="parking-circles"
            type="circle"
            source="parkings"
            paint={{
              'circle-radius': 9,
              'circle-color': '#2563eb',
              'circle-opacity': 0.82,
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
              'text-size': 11,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="recommended-parkings" data={recommendationCollection}>
          <Layer
            id="recommended-parking-halo"
            type="circle"
            source="recommended-parkings"
            paint={{
              'circle-radius': 17,
              'circle-color': '#22c55e',
              'circle-opacity': 0.2,
              'circle-stroke-color': '#86efac',
              'circle-stroke-width': 1,
            }}
          />
          <Layer
            id="recommended-parking-core"
            type="circle"
            source="recommended-parkings"
            paint={{
              'circle-radius': 12,
              'circle-color': '#16a34a',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            }}
          />
          <Layer
            id="recommended-parking-rank"
            type="symbol"
            source="recommended-parkings"
            layout={{
              'text-field': ['get', 'rankLabel'],
              'text-size': 11,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="selected-parking" data={selectedCollection}>
          <Layer
            id="selected-parking-halo"
            type="circle"
            source="selected-parking"
            paint={{
              'circle-radius': 22,
              'circle-color': '#f59e0b',
              'circle-opacity': 0.24,
              'circle-stroke-color': '#fcd34d',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="selected-parking-core"
            type="circle"
            source="selected-parking"
            paint={{
              'circle-radius': 15,
              'circle-color': '#d97706',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 4,
            }}
          />
          <Layer
            id="selected-parking-label"
            type="symbol"
            source="selected-parking"
            layout={{
              'text-field': 'P',
              'text-size': 13,
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
