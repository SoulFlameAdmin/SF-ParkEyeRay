import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ParkEyeRayMap } from './src/map/ParkEyeRayMap';
import { formatParkingDistance, preferenceLabel, rankParkings } from './src/parking/parkingIntelligence';
import { initialNavigationState, navigationReducer } from './src/navigation/navigationState';
import { useSensorEngine } from './src/sensors/useSensorEngine';
import { ParkEyeRayApi } from './src/services/parkingApi';
import type { CameraMode, ParkingFeature, ParkingPreference } from './src/types';

const api = new ParkEyeRayApi();
const MODES: Array<{ mode: CameraMode; label: string }> = [
  { mode: 'explore', label: 'Карта' },
  { mode: 'follow-north', label: 'Следвай' },
  { mode: 'follow-heading', label: 'Посока' },
  { mode: 'navigation', label: 'Навигация' },
];
const PREFERENCES: ParkingPreference[] = ['balanced', 'nearest', 'trusted', 'free', 'covered'];

export default function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const nativeSensors = useSensorEngine();
  const [parkings, setParkings] = useState<ParkingFeature[]>([]);
  const [parkingStatus, setParkingStatus] = useState('Зареждам картографирани паркинги');
  const [preference, setPreference] = useState<ParkingPreference>('balanced');
  const [selectedParkingId, setSelectedParkingId] = useState<string | null>(null);

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

  const recommendations = useMemo(
    () => rankParkings(parkings, { preference }),
    [parkings, preference],
  );
  const topRecommendations = recommendations.slice(0, 3);
  const selectedParking = selectedParkingId
    ? recommendations.find((item) => item.parking.id === selectedParkingId)?.parking ?? null
    : null;

  useEffect(() => {
    if (selectedParkingId && !recommendations.some((item) => item.parking.id === selectedParkingId)) {
      setSelectedParkingId(null);
    }
  }, [recommendations, selectedParkingId]);

  const sensorStatus = nativeSensors.permission === 'denied'
    ? 'GPS разрешението е отказано'
    : nativeSensors.error
      ? `Sensor error: ${nativeSensors.error}`
      : state.sensor
        ? `GPS ±${Math.round(state.sensor.accuracyMeters)} м · ${Math.round(state.sensor.speedKmh)} км/ч · ${state.sensor.headingSource} ${state.sensor.confidence}%`
        : 'Изчакване на native GPS и compass';

  const cyclePreference = () => {
    const index = PREFERENCES.indexOf(preference);
    setPreference(PREFERENCES[(index + 1) % PREFERENCES.length] ?? 'balanced');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ParkEyeRayMap
        sensor={state.sensor}
        cameraMode={state.cameraMode}
        parkings={parkings}
        recommendations={topRecommendations}
        selectedParking={selectedParking}
      />

      <View style={styles.statusCard} pointerEvents="none">
        <Text style={styles.title}>ParkEyeRay Native</Text>
        <Text style={styles.status}>{sensorStatus}</Text>
        <Text style={styles.parkingStatus}>{parkingStatus}</Text>
      </View>

      <View style={styles.intelligencePanel}>
        <View style={styles.intelligenceHead}>
          <View style={styles.intelligenceTitleWrap}>
            <Text style={styles.intelligenceTitle}>Parking Intelligence</Text>
            <Text style={styles.truthText}>Подходящост и надеждност · не live наличност</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={cyclePreference} style={styles.preferenceButton}>
            <Text style={styles.preferenceText}>{preferenceLabel(preference)}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendationRow}>
          {topRecommendations.length ? topRecommendations.map((item) => {
            const selected = selectedParkingId === item.parking.id;
            const reason = item.reasons[0] ?? item.warnings[0] ?? 'картографиран паркинг';
            return (
              <Pressable
                key={item.parking.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedParkingId(item.parking.id);
                  dispatch({ type: 'SET_CAMERA_MODE', mode: 'explore' });
                }}
                style={[styles.recommendationCard, selected && styles.recommendationCardSelected]}
              >
                <View style={styles.rankRow}>
                  <Text style={styles.rankBadge}>#{item.rank}</Text>
                  <Text style={[styles.riskBadge, item.risk === 'high' && styles.riskHigh]}>
                    {item.risk === 'low' ? 'нисък риск' : item.risk === 'medium' ? 'провери' : 'ограничение'}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.parkingName}>{item.parking.name || 'Паркинг'}</Text>
                <Text style={styles.scoreText}>{item.suitabilityScore}/100 · данни {item.dataConfidence}%</Text>
                <Text style={styles.detailText}>{formatParkingDistance(item.distanceMeters)} · {reason}</Text>
              </Pressable>
            );
          }) : (
            <View style={styles.emptyRecommendation}>
              <Text style={styles.emptyTitle}>Изчаквам паркинг данни</Text>
              <Text style={styles.emptyText}>Препоръките ще се изчислят автоматично.</Text>
            </View>
          )}
        </ScrollView>
      </View>

      <View style={styles.modeBar}>
        {MODES.map((item) => (
          <Pressable
            key={item.mode}
            accessibilityRole="button"
            accessibilityState={{ selected: state.cameraMode === item.mode }}
            onPress={() => {
              setSelectedParkingId(null);
              dispatch({ type: 'SET_CAMERA_MODE', mode: item.mode });
            }}
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
  intelligencePanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 88,
    paddingTop: 9,
    paddingBottom: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(7,17,31,0.95)',
  },
  intelligenceHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 7 },
  intelligenceTitleWrap: { flex: 1, minWidth: 0 },
  intelligenceTitle: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  truthText: { color: '#94a3b8', fontSize: 9, marginTop: 2 },
  preferenceButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, backgroundColor: '#172554' },
  preferenceText: { color: '#bfdbfe', fontSize: 10, fontWeight: '800' },
  recommendationRow: { paddingHorizontal: 8, gap: 8 },
  recommendationCard: {
    width: 178,
    padding: 10,
    borderWidth: 1,
    borderColor: '#243248',
    borderRadius: 14,
    backgroundColor: '#0b1728',
  },
  recommendationCardSelected: { borderColor: '#f59e0b', backgroundColor: '#281b09' },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rankBadge: { color: '#86efac', fontSize: 10, fontWeight: '900' },
  riskBadge: { color: '#fcd34d', fontSize: 8, fontWeight: '800' },
  riskHigh: { color: '#fca5a5' },
  parkingName: { color: '#ffffff', fontSize: 12, fontWeight: '800', marginTop: 5 },
  scoreText: { color: '#93c5fd', fontSize: 9, fontWeight: '700', marginTop: 4 },
  detailText: { color: '#cbd5e1', fontSize: 9, marginTop: 3 },
  emptyRecommendation: { width: 250, paddingHorizontal: 8, paddingVertical: 10 },
  emptyTitle: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  emptyText: { color: '#94a3b8', fontSize: 9, marginTop: 3 },
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
