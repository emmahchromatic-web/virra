import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, SafeAreaView, ScrollView, NativeModules } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { useSessionStore, LOCAL_ACTIVITY_PREFIX } from '@/store/sessionStore';
import { getCycleInfo } from '@/lib/cycleEngine';
import { cancelTrainingReminderToday } from '@/lib/notifications';
import { fetchRunHeartRate, type TimeWindow } from '@/lib/healthKitHeartRate';
import { createRunTrackState, addGpsPoint, type RunTrackState, type GpsPoint } from '@/lib/runTracking';
import {
  startBackgroundLocationTracking, stopBackgroundLocationTracking, subscribeToBackgroundLocations,
} from '@/lib/backgroundLocationTask';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { appAlert, VirraAlertHost } from '@/components/ui/VirraAlert';
import { enqueue } from '@/lib/outbox';
import { useSessionById } from '@/hooks/useSessionById';
import { enrichTodaysSessions } from '@/lib/todaysSession';
import { sessionLabelText } from '@/lib/sessionLabels';
import type { RunWorkoutStructure, RunStep } from '@/lib/workoutStructure';
import { syncPending } from '@/lib/syncPending';

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

/**
 * What today's run is meant to be, for the target strip. Card 322: the tracker
 * took a sessionId purely to write the session back as completed when you
 * saved, and showed nothing about it — so someone starting today's easy 3.1 km
 * saw a blank counter and had to remember the plan themselves.
 */
interface RunTarget {
  label:      string;
  distanceKm: number | null;
  paceSecs:   number | null;
  /** Today's cycle line for THIS session, not a generic sentence per phase. */
  reason:     string | null;
  /** "4 x 800m @ 4:20" and the like, when the session is structured. */
  summary:    string | null;
}

const PHASE_CUE: Record<string, string> = {
  menstrual:  'Keep it easy. Effort over pace today.',
  follicular: 'Good day to push. Your body is primed.',
  ovulatory:  'Peak window. Give it everything.',
  luteal:     'Steady does it. Honour how you feel.',
};

type RunState = 'idle' | 'active' | 'paused' | 'finished';

// ---- Component ----

export default function RunTrackerScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const { session }               = useAuthStore();
  const { periodStart, cycleLength, periodDays, cycleInfo } = useCycleStore();

  // Card 322. The planned session, from the same cache the workout screen
  // reads, so a run started in a dead spot still shows its target.
  const plannedRow = useSessionById(sessionId ?? null);
  const [target,       setTarget]       = useState<RunTarget | null>(null);

  const [runState,     setRunState]     = useState<RunState>('idle');
  const [distanceM,    setDistanceM]    = useState(0);
  const [elapsedS,     setElapsedS]     = useState(0);
  const [currentPace,  setCurrentPace]  = useState<number | null>(null);
  const [splits,       setSplits]       = useState<number[]>([]);   // sec/km per completed km
  const [saving,       setSaving]       = useState(false);

  const startedAt      = useRef<Date | null>(null);
  const endedAt        = useRef<Date | null>(null);    // when Stop was tapped, not when Save was
  const pausedAt       = useRef<number>(0);            // total paused seconds
  const pauseStart     = useRef<number | null>(null);
  const pauseWindows   = useRef<TimeWindow[]>([]);      // excluded from the heart-rate window
  const trackState     = useRef<RunTrackState>(createRunTrackState());
  const unsubscribeGps = useRef<(() => void) | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

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
  // Delivered via the background TaskManager task (backgroundLocationTask.ts)
  // rather than a plain watchPositionAsync subscription, so tracking survives
  // the app being backgrounded — screen lock, app switch, an incoming call —
  // under the NSLocationAlwaysAndWhenInUseUsageDescription entitlement.
  function handleGpsPoint(point: GpsPoint) {
    if (!startedAt.current) return;
    const next = addGpsPoint(trackState.current, point, startedAt.current.getTime(), pausedAt.current * 1000);
    trackState.current = next;
    setDistanceM(next.distanceM);
    setSplits(next.splits);
    setCurrentPace(next.currentPaceSecPerKm);
  }

  async function startTracking() {
    const mode = await startBackgroundLocationTracking();
    if (!mode) {
      appAlert('Location needed', 'Enable location access to track your run.');
      return false;
    }
    unsubscribeGps.current = subscribeToBackgroundLocations(handleGpsPoint);
    return true;
  }

  async function stopTracking() {
    unsubscribeGps.current?.();
    unsubscribeGps.current = null;
    await stopBackgroundLocationTracking();
  }

  // ---- Controls ----
  async function handleStart() {
    startedAt.current      = new Date();
    endedAt.current        = null;
    pausedAt.current       = 0;
    pauseStart.current     = null;
    pauseWindows.current   = [];
    trackState.current     = createRunTrackState();
    setSplits([]);
    setDistanceM(0);
    setElapsedS(0);
    setCurrentPace(null);

    const ok = await startTracking();
    if (!ok) return;
    startTimer();
    setRunState('active');
  }

  async function handlePause() {
    stopTimer();
    await stopTracking();
    pauseStart.current = Date.now();
    setRunState('paused');
  }

  async function handleResume() {
    if (pauseStart.current) {
      const resumedAt = Date.now();
      pausedAt.current += Math.floor((resumedAt - pauseStart.current) / 1000);
      pauseWindows.current.push({ start: pauseStart.current, end: resumedAt });
      pauseStart.current = null;
    }
    await startTracking();
    startTimer();
    setRunState('active');
  }

  async function handleStop() {
    stopTimer();
    await stopTracking();
    const stoppedAt = Date.now();
    if (pauseStart.current) {
      pausedAt.current += Math.floor((stoppedAt - pauseStart.current) / 1000);
      pauseWindows.current.push({ start: pauseStart.current, end: stoppedAt });
      pauseStart.current = null;
    }
    endedAt.current = new Date(stoppedAt);
    setRunState('finished');
  }

  useEffect(() => () => { stopTimer(); stopTracking(); }, []);

  // ---- Save ----
  async function handleSave() {
    if (!session || !startedAt.current) return;
    setSaving(true);

    const finishedAt    = endedAt.current ?? new Date();
    const avgPaceSecKm  = distanceM > 100
      ? Math.round(elapsedS / (distanceM / 1000))
      : null;

    // Heart rate comes from whatever the watch recorded during the run. Nulls
    // when there's no watch, no read access, or samples haven't synced yet.
    const { hrAvg, hrMax } = await fetchRunHeartRate(
      startedAt.current,
      finishedAt,
      pauseWindows.current,
    );

    const phaseAtTime = periodStart
      ? getCycleInfo(periodStart, cycleLength ?? 28, startedAt.current, periodDays).phase
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
      // Card 253. This used to leave the run in component state and nowhere
      // else, so closing the app lost it. GPS needs no signal, which is exactly
      // why runs happen in valleys and on trails: the one workout most likely
      // to finish offline was the only one with no local persistence at all.
      await enqueue(session.user.id, 'completeWorkout', {
        kind:      'run',
        queuedAt:  new Date().toISOString(),
        sessionId: sessionId ?? null,
        activity: {
          user_id:          session.user.id,
          activity_type:    'run',
          started_at:       startedAt.current.toISOString(),
          duration_seconds: elapsedS,
          distance_meters:  Math.round(distanceM),
          phase_at_time:    phaseAtTime,
        },
        runDetails: {
          avg_pace_seconds_per_km: avgPaceSecKm,
          splits_json:             splits.map((s, i) => ({ km: i + 1, sec: s })),
          hr_avg:                  hrAvg,
          hr_max:                  hrMax,
          gps_trace:               trackState.current.trace,
        },
      });
      if (sessionId) {
        useSessionStore.getState().applyLocalCompletion(
          sessionId,
          `${LOCAL_ACTIVITY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        );
      }
      // Fire-and-forget, same as `_layout.tsx`'s three trigger sites. When the
      // device is genuinely offline this just makes the pill say so at once;
      // when the write failed transiently on a NOMINALLY online device (a 5xx,
      // a dropped connection), it both surfaces the pending work immediately
      // -- otherwise the pill stays silent until the next foreground or
      // reconnect, which may never come this session -- and retries now.
      syncPending(session.user.id);
      setSaving(false);
      appAlert(
        'Saved on your phone',
        'You are offline, so this run will sync as soon as you have signal. Nothing is lost.',
      );
      router.back();
      return;
    }

    await supabase.from('run_details').insert({
      activity_id:             act.id,
      avg_pace_seconds_per_km: avgPaceSecKm,
      splits_json:             splits.map((s, i) => ({ km: i + 1, sec: s })),
      hr_avg:                  hrAvg,
      hr_max:                  hrMax,
      gps_trace:               trackState.current.trace,
    });

    if (sessionId) {
      const { error: sessionErr } = await supabase
        .from('planned_sessions')
        .update({ status: 'completed', activity_id: act.id })
        .eq('id', sessionId);
      if (sessionErr) {
        console.error('[run] failed to mark session completed', sessionErr);
      } else {
        // Card 253, same as the strength path: the Training tab reads the
        // cache, so a server-only write leaves it saying TO DO.
        useSessionStore.getState().applyLocalCompletion(sessionId, act.id);
      }
    }

    // Write to HealthKit
    const HK = NativeModules.AppleHealthKit;
    if (HK?.saveWorkout) {
      HK.saveWorkout(
        {
          type:         'Running',
          startDate:    startedAt.current.toISOString(),
          endDate:      finishedAt.toISOString(),
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
    appAlert('Discard run?', 'This run won\'t be saved.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  // Card 322. Enrichment gives the cycle-adjusted pace and this session's own
  // reason, which is what the dashboard card already shows; falling back to the
  // structure keeps a target on screen when that call cannot run (offline, or
  // no profile row yet). Runs once per session, never on the GPS tick.
  useEffect(() => {
    if (!plannedRow || plannedRow.modality !== 'run') { setTarget(null); return; }
    let cancelled = false;

    const structure = (plannedRow.run_structure ?? null) as RunWorkoutStructure | null;
    const totalM    = structure?.total_distance_m ?? null;
    const firstPace = structure?.steps?.find((st: RunStep) => st.target?.pace_secs_per_km)?.target?.pace_secs_per_km ?? null;
    const base: RunTarget = {
      label:      sessionLabelText(plannedRow.session_label),
      distanceKm: totalM ? totalM / 1000 : null,
      paceSecs:   firstPace,
      reason:     null,
      summary:    null,
    };
    setTarget(base);

    if (!session) return;
    // The store row carries every modality the app knows; enrichment takes the
    // narrower set it can actually enrich, and this path is run-only anyway.
    enrichTodaysSessions(session.user.id, [plannedRow as unknown as Parameters<typeof enrichTodaysSessions>[1][number]])
      .then(([enriched]) => {
        if (cancelled || !enriched) return;
        setTarget({
          ...base,
          paceSecs: enriched.cycle_adjusted_pace_secs ?? base.paceSecs,
          reason:   enriched.cycle_reason_short,
          summary:  enriched.structure_summary,
        });
      })
      .catch(() => { /* the plain target above is already on screen */ });

    return () => { cancelled = true; };
  }, [plannedRow, session]);

  // ---- Derived ----
  const distanceKm = (distanceM / 1000).toFixed(2);
  const avgPace    = distanceM > 100
    ? Math.round(elapsedS / (distanceM / 1000))
    : null;
  // This session's own line first; the generic per-phase sentence is for a
  // free run, which has no session to speak for it.
  const phaseCue   = target?.reason ?? (cycleInfo ? PHASE_CUE[cycleInfo.phase] : null);

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
        <VirraText variant="mono" size={11} color={colors.pulse} style={styles.headerTitle}>
          {runState === 'idle'     ? 'RUN TRACKER' :
           runState === 'active'   ? 'RUNNING' :
           runState === 'paused'   ? 'PAUSED' :
                                    'RUN COMPLETE'}
        </VirraText>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Card 322. What this run is meant to be. Deliberately quiet next to
            the live counter below: "3.1 km target" and "3.1 km so far" must
            never be mistaken for each other. */}
        {target && (
          <View style={styles.targetCard}>
            <VirraText variant="mono" size={10} color={colors.muted} style={styles.targetLabel}>
              TARGET
            </VirraText>
            <View style={styles.targetRow}>
              <VirraText variant="display" size={17} color={colors.breath}>
                {target.label}
              </VirraText>
              {target.distanceKm != null && (
                <VirraText variant="mono" size={12} color={colors.breath}>
                  {target.distanceKm.toFixed(target.distanceKm >= 10 ? 0 : 1)} KM
                </VirraText>
              )}
              {target.paceSecs != null && (
                <VirraText variant="mono" size={12} color={colors.pulse}>
                  {formatPace(target.paceSecs)}/KM
                </VirraText>
              )}
            </View>
            {target.summary && (
              <VirraText variant="mono" size={11} color={colors.muted}>
                {target.summary}
              </VirraText>
            )}
          </View>
        )}

        {/* Primary stat: distance */}
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
              <VirraText variant="mono" size={11} color={colors.muted}>TIME</VirraText>
              <VirraText variant="display" size={24} color={colors.breath}>{formatDuration(elapsedS)}</VirraText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <VirraText variant="mono" size={11} color={colors.muted}>PACE</VirraText>
              <VirraText variant="display" size={24} color={colors.breath}>
                {formatPace(runState === 'active' ? (currentPace ?? avgPace) : avgPace)}
              </VirraText>
              <VirraText variant="mono" size={10} color={colors.muted}>/KM</VirraText>
            </View>
            {runState === 'active' && currentPace && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="mono" size={11} color={colors.muted}>AVG</VirraText>
                  <VirraText variant="display" size={24} color={colors.breath}>{formatPace(avgPace)}</VirraText>
                  <VirraText variant="mono" size={10} color={colors.muted}>/KM</VirraText>
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
                <VirraText variant="mono" size={11} color={colors.pulse} style={styles.splitsLabel}>SPLITS</VirraText>
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
      {/* This screen is presented as a native modal, so it needs its own
          alert host: the root one cannot draw over a modal screen. */}
      <VirraAlertHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 48 },
  headerTitle:  { letterSpacing: 1.5 },
  closeBtn:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:       { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl, alignItems: 'center' },
  targetCard: {
    backgroundColor: colors.mist, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    gap: 4, marginBottom: spacing.md,
  },
  targetLabel: { letterSpacing: 1.5 },
  targetRow:   { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  distanceBlock:{ alignItems: 'center', gap: 4, marginTop: spacing.xl },
  distanceNum:  { lineHeight: 80 },
  distanceUnit: { letterSpacing: 2 },
  statsRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stat:         { alignItems: 'center', gap: 2 },
  statDivider:  { width: 1, height: 40, backgroundColor: colors.border },
  cue:          { textAlign: 'center', lineHeight: 24, paddingHorizontal: spacing.xl, fontStyle: 'italic' },
  startBtn:     { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.pulse, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  controls:     { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  controlBtn:   { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.control, alignItems: 'center', justifyContent: 'center' },
  stopBtn:      { backgroundColor: colors.heat, borderColor: colors.heat },
  resumeBtn:    { backgroundColor: colors.pulse, borderColor: colors.pulse },
  splitsBlock:  { width: '100%', gap: spacing.xs },
  splitsLabel:  { letterSpacing: 1.5, marginBottom: spacing.xs },
  splitRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  saveCta:      { width: '100%' },
});
