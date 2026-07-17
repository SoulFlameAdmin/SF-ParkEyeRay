import React, { useEffect, useReducer, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ParkEyeRayMap } from './src/map/ParkEyeRayMap';
import { initialNavigationState, navigationReducer } from './src/navigation/navigationState';
import { useSensorEngine } from './src/sensors/useSensorEngine';
import { ParkEyeRayApi } from './src/services/parkingApi';
import type { CameraMode, ParkingFeature } from './src/types';

const api = new ParkEyeRayApi();
const MODES: Array<{ mode: CameraMode; label: string }> = [
  { mode: 'explore', label: 'Карта' },
  { mode: 'follow-north', label: 'Следвай' },
  { mode: 'follow-heading', label: 'Посока' },
  { mode: 'navigation', label: 'Навигация' },
];

export default function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const nativeSensors = useSensorEngine();
  const [parkings, setParkings] = useState<ParkingFeature[]>([]);
  const [parkingStatus, setParkingStatus] = useState('Зареждам картографирани паркинги');

  useEffect(() => {
    if (nativeSensors.sensor) dispatch({ type: 'SENSOR_UPDATE', sensor: nativeSensors.sensor });
  }, [nativeSensors.sensor]);

  useEffect(() => {
    const center = state.sensor?.coordinate ?? { latitude: 42.7339, longitude: 25.4858 };
    const controller = new AbortController();
    api.parkings(center, state.sensor ? 1000 : 5000, controller.signal)
      .then((payload) => {
        setParkings(payload.parkings);
        setParkingStatus(`${payload.parkings.length} картографирани паркинга · без live свободни места`);
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setParkingStatus('Parking API временно не отговори');
      });
    return () => controller.abort();
  }, [state.sensor?.coordinate.latitude, state.sensor?.coordinate.longitude]);

  const sensorStatus = nativeSensors.permission === 'denied'
    ? 'GPS разрешението е отказано'
    : nativeSensors.error
      ? `Sensor error: ${nativeSensors.error}`
      : state.sensor
        ? `GPS ±${Math.round(state.sensor.accuracyMeters)} м · ${Math.round(state.sensor.speedKmh)} км/ч · ${state.sensor.headingSource} ${state.sensor.confidence}%`
        : 'Изчакване на native GPS и compass';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ParkEyeRayMap sensor={state.sensor} cameraMode={state.cameraMode} parkings={parkings} />

      <View style={styles.statusCard} pointerEvents="none">
        <Text style={styles.title}>ParkEyeRay Native</Text>
        <Text style={styles.status}>{sensorStatus}</Text>
        <Text style={styles.parkingStatus}>{parkingStatus}</Text>
      </View>

      <View style={styles.modeBar}>
        {MODES.map((item) => (
          <Pressable
            key={item.mode}
            accessibilityRole="button"
            accessibilityState={{ selected: state.cameraMode === item.mode }}
            onPress={() => dispatch({ type: 'SET_CAMERA_MODE', mode: item.mode })}
            style={[styles.modeButton, state.cameraMode === item.mode && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, state.cameraMode === item.mode && styles.modeTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111f' },
  statusCard: {
    position: 'absolute',
    top: 18,
    left: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: 'rgba(7,17,31,0.92)',
  },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  status: { color: '#bfdbfe', fontSize: 11, marginTop: 3 },
  parkingStatus: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  modeBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 18,
    flexDirection: 'row',
    gap: 7,
    padding: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(7,17,31,0.94)',
  },
  modeButton: { flex: 1, paddingVertical: 11, borderRadius: 13, alignItems: 'center' },
  modeButtonActive: { backgroundColor: '#2563eb' },
  modeText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  modeTextActive: { color: '#ffffff' },
});
