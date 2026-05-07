import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Pressable, StyleSheet, SafeAreaView, Alert, ScrollView, NativeModules,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo } from '@/lib/cycleEngine';
import { cancelTrainingReminderToday } from '@/lib/notifications';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

// ---- Geo helpers ----

interface GpsPoint { lat: number; lon: number; ts: number; alt?: number }

function haversineMeters(a: GpsPoint, b: GpsPoint): number {
  const R    = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x    = Math.sin(dLat / 2) ** 2
             + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
             * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDuration(s: number): string {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function formatPace(secPerKm: number | null): string {
  if (!secPerKm || secPerKm <= 0 || secPerKm > 1800) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PHASE_CUE: Record<string, string> = {
  menstrual:  'Keep it easy — effort over pace today.',
  follicular: 'Good day to push. Your body is primed.',
  ovulatory:  'Peak window. Give it everything.',
  luteal:     'Steady does it. Honour how you feel.',
};

type RunState = 'idle' | 'active' | 'paused' | 'finished';

// ---- Component ----

export default function RunTrackerScreen() {
  const { session }               = useAuthStore();
  const { periodStart, cycleLength, cycleInfo } = useCycleStore();

  const [runState,     setRunState]     = useState<RunState>('idle');
  const [distanceM,    setDistanceM]    = useState(0);
  const [elapsedS,     setElapsedS]     = useState(0);
  const [currentPace,  setCurrentPace]  = useState<number | null>(null);
  const [splits,       setSplits]       = useState<number[]>([]);   // sec/km per completed km
  const [saving,       setSaving]       = useState(false);

  const startedAt     = useRef<Date | null>(null);
  const pausedAt      = useRef<number>(0);            // total paused seconds
  const pauseStart    = useRef<number | null>(null);
  const gpsTrace      = useRef<GpsPoint[]>([]);
  const locationSub   = useRef<Location.LocationSubscription | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastKmAt      = useRef<number>(0);            // distance in m at last km split
  const lastSplitTime = useRef<number>(0);            // elapsed seconds at last km split

  // ---- Timer ----
  function startTimer() {
    timerRef.current = setInterval(() => {
      setElapsedS(() => {
        const now    = Date.now();
        const runMs  = now - startedAt.current!.getTime() - pausedAt.current * 1000;
        return Math.floor(runMs / 1000);
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ---- Location ----
  async function startTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location needed', 'Enable location access to track your run.');
      return false;
    }
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
      (loc) => {
        const point: GpsPoint = {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          ts:  loc.timestamp,
          alt: loc.coords.altitude ?? undefined,
        };
        gpsTrace.current.push(point);

        const trace = gpsTrace.current;
        if (trace.length < 2) return;

        // Accumulate distance
        const delta = haversineMeters(trace[trace.length - 2], trace[trace.length - 1]);
        setDistanceM((prev) => {
          const next = prev + delta;

          // Km split
          const kmNow   = Math.floor(next / 1000);
          const kmPrev  = Math.floor(prev / 1000);
          if (kmNow > kmPrev) {
            setElapsedS((elapsed) => {
              const splitSec = elapsed - lastSplitTime.current;
              setSplits((s) => [...s, splitSec]);
              lastSplitTime.current = elapsed;
              return elapsed;
            });
            lastKmAt.current = next;
          }

          return next;
        });

        // Current pace: distance + time in last ~30 s of GPS points
        const cutoff   = loc.timestamp - 30000;
        const recent   = trace.filter((p) => p.ts >= cutoff);
        if (recent.length >= 2) {
          let d = 0;
          for (let i = 1; i < recent.length; i++) d += haversineMeters(recent[i - 1], recent[i]);
          const t = (recent[recent.length - 1].ts - recent[0].ts) / 1000;
          setCurrentPace(d > 10 && t > 0 ? Math.round(t / (d / 1000)) : null);
        }
      }
    );
    return true;
  }

  function stopTracking() {
    locationSub.current?.remove();
    locationSub.current = null;
  }

  // ---- Controls ----
  async function handleStart() {
    startedAt.current      = new Date();
    pausedAt.current       = 0;
    pauseStart.current     = null;
    gpsTrace.current       = [];
    lastKmAt.current       = 0;
    lastSplitTime.current  = 0;
    setSplits([]);
    setDistanceM(0);
    setElapsedS(0);

    const ok = await startTracking();
    if (!ok) return;
    startTimer();
    setRunState('active');
  }

  function handlePause() {
    stopTimer();
    stopTracking();
    pauseStart.current = Date.now();
    setRunState('paused');
  }

  async function handleResume() {
    if (pauseStart.current) {
      pausedAt.current += Math.floor((Date.now() - pauseStart.current) / 1000);
      pauseStart.current = null;
    }
    await startTracking();
    startTimer();
    setRunState('active');
  }

  function handleStop() {
    stopTimer();
    stopTracking();
    if (pauseStart.current) {
      pausedAt.current += Math.floor((Date.now() - pauseStart.current) / 1000);
    }
    setRunState('finished');
  }

  useEffect(() => () => { stopTimer(); stopTracking(); }, []);

  // ---- Save ----
  async function handleSave() {
    if (!session || !startedAt.current) return;
    setSaving(true);

    const endedAt       = new Date();
    const avgPaceSecKm  = distanceM > 100
      ? Math.round(elapsedS / (distanceM / 1000))
      : null;

    const phaseAtTime = periodStart
      ? getCycleInfo(periodStart, cycleLength ?? 28, startedAt.current).phase
      : null;

    const { data: act, error: actErr } = await supabase
      .from('activities')
      .insert({
        user_id:          session.user.id,
        activity_type:    'run',
        started_at:       startedAt.current.toISOString(),
        duration_seconds: elapsedS,
        distance_meters:  Math.round(distanceM),
        phase_at_time:    phaseAtTime,
      })
      .select('id')
      .single();

    if (actErr) {
      Alert.alert('Save failed', actErr.message);
      setSaving(false);
      return;
    }

    await supabase.from('run_details').insert({
      activity_id:             act.id,
      avg_pace_seconds_per_km: avgPaceSecKm,
      splits_json:             splits.map((s, i) => ({ km: i + 1, sec: s })),
      gps_trace:               gpsTrace.current,
    });

    // Write to HealthKit
    const HK = NativeModules.AppleHealthKit;
    if (HK?.saveWorkout) {
      HK.saveWorkout(
        {
          type:         'Running',
          startDate:    startedAt.current.toISOString(),
          endDate:      endedAt.toISOString(),
          duration:     elapsedS,
          distance:     Math.round(distanceM),
          distanceUnit: 'meter',
        },
        () => {},
      );
    }

    cancelTrainingReminderToday();
    setSaving(false);
    router.back();
  }

  function handleDiscard() {
    Alert.alert('Discard run?', 'This run won\'t be saved.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  // ---- Derived ----
  const distanceKm = (distanceM / 1000).toFixed(2);
  const avgPace    = distanceM > 100
    ? Math.round(elapsedS / (distanceM / 1000))
    : null;
  const phaseCue   = cycleInfo ? PHASE_CUE[cycleInfo.phase] : null;

  // ---- Render ----
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        {runState === 'idle' && (
          <Pressable onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <SymbolView name="xmark" size={18} tintColor={colors.muted} />
          </Pressable>
        )}
        <VirraText variant="mono" size={9} color={colors.pulse} style={styles.headerTitle}>
          {runState === 'idle'     ? 'RUN TRACKER' :
           runState === 'active'   ? 'RUNNING' :
           runState === 'paused'   ? 'PAUSED' :
                                    'RUN COMPLETE'}
        </VirraText>
        {cycleInfo && runState === 'idle' && (
          <VirraText variant="mono" size={9} color={colors.muted}>
            {cycleInfo.phase.toUpperCase()} · DAY {cycleInfo.dayOfCycle}
          </VirraText>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Primary stat — distance */}
        <View style={styles.distanceBlock}>
          <VirraText variant="display" size={72} color={colors.breath} style={styles.distanceNum}>
            {runState === 'idle' ? '0.00' : distanceKm}
          </VirraText>
          <VirraText variant="mono" size={12} color={colors.muted} style={styles.distanceUnit}>KM</VirraText>
        </View>

        {/* Secondary stats */}
        {runState !== 'idle' && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <VirraText variant="mono" size={9} color={colors.muted}>TIME</VirraText>
              <VirraText variant="display" size={24} color={colors.breath}>{formatDuration(elapsedS)}</VirraText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <VirraText variant="mono" size={9} color={colors.muted}>PACE</VirraText>
              <VirraText variant="display" size={24} color={colors.breath}>
                {formatPace(runState === 'active' ? (currentPace ?? avgPace) : avgPace)}
              </VirraText>
              <VirraText variant="mono" size={8} color={colors.muted}>/KM</VirraText>
            </View>
            {runState === 'active' && currentPace && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="mono" size={9} color={colors.muted}>AVG</VirraText>
                  <VirraText variant="display" size={24} color={colors.breath}>{formatPace(avgPace)}</VirraText>
                  <VirraText variant="mono" size={8} color={colors.muted}>/KM</VirraText>
                </View>
              </>
            )}
          </View>
        )}

        {/* Phase cue */}
        {phaseCue && (runState === 'idle' || runState === 'active') && (
          <VirraText variant="serif" size={16} color="rgba(244,237,224,0.55)" style={styles.cue}>
            {phaseCue}
          </VirraText>
        )}

        {/* Controls */}
        {runState === 'idle' && (
          <Pressable onPress={handleStart} style={styles.startBtn} accessibilityRole="button" accessibilityLabel="Start run">
            <SymbolView name="play.fill" size={32} tintColor={colors.mile} />
          </Pressable>
        )}

        {runState === 'active' && (
          <View style={styles.controls}>
            <Pressable onPress={handlePause} style={styles.controlBtn} accessibilityRole="button" accessibilityLabel="Pause">
              <SymbolView name="pause.fill" size={26} tintColor={colors.breath} />
            </Pressable>
            <Pressable onPress={handleStop} style={[styles.controlBtn, styles.stopBtn]} accessibilityRole="button" accessibilityLabel="Stop">
              <SymbolView name="stop.fill" size={26} tintColor={colors.mile} />
            </Pressable>
          </View>
        )}

        {runState === 'paused' && (
          <View style={styles.controls}>
            <Pressable onPress={handleResume} style={[styles.controlBtn, styles.resumeBtn]} accessibilityRole="button" accessibilityLabel="Resume">
              <SymbolView name="play.fill" size={26} tintColor={colors.mile} />
            </Pressable>
            <Pressable onPress={handleStop} style={styles.controlBtn} accessibilityRole="button" accessibilityLabel="Stop">
              <SymbolView name="stop.fill" size={26} tintColor={colors.breath} />
            </Pressable>
          </View>
        )}

        {runState === 'finished' && (
          <>
            {/* Splits */}
            {splits.length > 0 && (
              <View style={styles.splitsBlock}>
                <VirraText variant="mono" size={9} color={colors.pulse} style={styles.splitsLabel}>SPLITS</VirraText>
                {splits.map((s, i) => (
                  <View key={i} style={styles.splitRow}>
                    <VirraText variant="mono" size={11} color={colors.muted}>KM {i + 1}</VirraText>
                    <VirraText variant="mono" size={11} color={colors.breath}>{formatPace(s)}/km</VirraText>
                  </View>
                ))}
                {/* Partial last km */}
                {distanceM % 1000 > 50 && (
                  <View style={styles.splitRow}>
                    <VirraText variant="mono" size={11} color={colors.muted}>
                      +{((distanceM % 1000) / 1000).toFixed(2)} km
                    </VirraText>
                    <VirraText variant="mono" size={11} color={colors.muted}>—</VirraText>
                  </View>
                )}
              </View>
            )}

            <VirraButton label="Save run" onPress={handleSave} loading={saving} style={styles.saveCta} />
            <VirraButton label="Discard" variant="ghost" onPress={handleDiscard} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 48 },
  headerTitle:  { letterSpacing: 1.5 },
  closeBtn:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:       { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl, alignItems: 'center' },
  distanceBlock:{ alignItems: 'center', gap: 4, marginTop: spacing.xl },
  distanceNum:  { lineHeight: 80 },
  distanceUnit: { letterSpacing: 2 },
  statsRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stat:         { alignItems: 'center', gap: 2 },
  statDivider:  { width: 1, height: 40, backgroundColor: colors.border },
  cue:          { textAlign: 'center', lineHeight: 24, paddingHorizontal: spacing.xl, fontStyle: 'italic' },
  startBtn:     { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.pulse, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  controls:     { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  controlBtn:   { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stopBtn:      { backgroundColor: colors.heat, borderColor: colors.heat },
  resumeBtn:    { backgroundColor: colors.pulse, borderColor: colors.pulse },
  splitsBlock:  { width: '100%', gap: spacing.xs },
  splitsLabel:  { letterSpacing: 1.5, marginBottom: spacing.xs },
  splitRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  saveCta:      { width: '100%' },
});
