import React, { useEffect, useReducer, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ParkEyeRayMap } from './src/map/ParkEyeRayMap';
import { initialNavigationState, navigationReducer } from './src/navigation/navigationState';
import { ParkEyeRayApi } from './src/services/parkingApi';
import type { ParkingFeature } from './src/types';

const api = new ParkEyeRayApi();

export default function App() {
  const [state] = useReducer(navigationReducer, initialNavigationState);
  const [parkings, setParkings] = useState<ParkingFeature[]>([]);
  const [status, setStatus] = useState('Изчакване на native GPS service');

  useEffect(() => {
    const center = state.sensor?.coordinate ?? { latitude: 42.7339, longitude: 25.4858 };
    const controller = new AbortController();
    api.parkings(center, state.sensor ? 1000 : 5000, controller.signal)
      .then((payload) => {
        setParkings(payload.parkings);
        setStatus(`${payload.parkings.length} картографирани паркинга · без live свободни места`);
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setStatus('Parking API временно не отговори');
      });
    return () => controller.abort();
  }, [state.sensor?.coordinate.latitude, state.sensor?.coordinate.longitude]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ParkEyeRayMap sensor={state.sensor} cameraMode={state.cameraMode} parkings={parkings} />
      <View style={styles.statusCard} pointerEvents="none">
        <Text style={styles.title}>ParkEyeRay Native</Text>
        <Text style={styles.status}>{status}</Text>
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
});
