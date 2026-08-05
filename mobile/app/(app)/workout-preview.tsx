import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, Alert,
  NativeModules, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { cancelTrainingReminderToday } from '@/lib/notifications';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { formatPace } from '@/lib/volumePlan';
import { generateStrengthStructure } from '@/lib/strengthWorkoutGenerator';
import { normalizeStrengthSessionType } from '@/lib/strengthTypes';
import type { RunWorkoutStructure, StrengthWorkoutStructure } from '@/lib/workoutStructure';

type ScreenState = 'loading' | 'idle' | 'active' | 'paused';

const HK_TYPE: Record<string, string> = {
  strength: 'TraditionalStrengthTraining',
  yoga:     'Yoga',
  swim:     'Swimming',
  other:    'FunctionalStrengthTraining',
};

const MODALITY_ICON: Record<string, string> = {
  strength: 'dumbbell.fill',
  yoga:     'figure.mind.and.body',
  swim:     'figure.pool.swim',
  other:    'figure.mixed.cardio',
};

interface SessionData {
  id:                       string;
  session_label:            string;
  modality:                 string;
  run_structure:            RunWorkoutStructure | null;
  strength_structure:       StrengthWorkoutStructure | null;
  cycle_reason_short:       string | null;
  cycle_adjusted_pace_secs: number | null;
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildStepLines(session: SessionData): string[] {
  if (session.strength_structure) {
    return session.strength_structure.exercises.map(
      (e) => `${e.name}  ·  ${e.target_sets.length} × ${e.target_sets[0].reps} reps`,
    );
  }
  if (session.run_structure) {
    return session.run_structure.steps.map((step) => {
      const dist = step.target.distance_m ? `${(step.target.distance_m / 1000).toFixed(1)}km` : '';
      const pace = step.target.pace_secs_per_km
        ? `@ ${formatPace(step.target.pace_secs_per_km)}`
        : step.target.pace_band ?? '';
      return [step.label ?? step.kind, dist, pace].filter(Boolean).join('  ·  ');
    });
  }
  return [];
}

export default function WorkoutPreviewScreen() {
  const { sessionId }  = useLocalSearchParams<{ sessionId?: string }>();
  const { session }    = useAuthStore();
  const { cycleInfo }  = useCycleStore();

  const [state,       setState]       = useState<ScreenState>('loading');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [elapsedS,    setElapsedS]    = useState(0);
  const [saving,      setSaving]      = useState(false);

  const startedAt        = useRef<Date | null>(null);
  const pausedAt         = useRef<number | null>(null);
  const pausedDurationMs = useRef(0);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) { setState('idle'); return; }
    // NOTE: cycle_reason_short / cycle_adjusted_pace_secs are computed at
    // runtime (see todaysSession.ts) and are NOT columns on planned_sessions —
    // selecting them made this query error out, leaving every non-run session
    // stuck on the generic timer with no exercises.
    supabase
      .from('planned_sessions')
      .select('id, session_label, modality, run_structure, strength_structure')
      .eq('id', sessionId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const row: SessionData = {
            ...(data as Omit<SessionData, 'cycle_reason_short' | 'cycle_adjusted_pace_secs'>),
            cycle_reason_short:       null,
            cycle_adjusted_pace_secs: null,
          };
          // Recover strength sessions saved without a structure (e.g. a plan
          // whose label never mapped to a library key). Generate on the fly so
          // the exercise list renders instead of just a bare timer.
          if (row.modality === 'strength' && !row.strength_structure) {
            row.strength_structure = generateStrengthStructure({
              session_type:           normalizeStrengthSessionType(row.session_label),
              phase:                  cycleInfo?.phase ?? null,
              recent_primary_muscles: [],
            });
          }
          setSessionData(row);
        }
        setState('idle');
      });
  }, [sessionId]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startTicker() {
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current!.getTime() - pausedDurationMs.current;
      setElapsedS(Math.floor(elapsed / 1000));
    }, 1000);
  }

  function startTimer() {
    startedAt.current      = new Date();
    pausedDurationMs.current = 0;
    setState('active');
    startTicker();
  }

  function handlePause() {
    if (timerRef.current) clearInterval(timerRef.current);
    pausedAt.current = Date.now();
    setState('paused');
  }

  function handleResume() {
    if (pausedAt.current) {
      pausedDurationMs.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    startTicker();
    setState('active');
  }

  function handleStop() {
    if (timerRef.current) clearInterval(timerRef.current);
    // Flush any in-progress pause so elapsedS and durationSeconds are accurate
    if (pausedAt.current) {
      pausedDurationMs.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
      // Recompute elapsed with the flushed paused time
      const elapsed = Date.now() - startedAt.current!.getTime() - pausedDurationMs.current;
      setElapsedS(Math.floor(elapsed / 1000));
    }
    const finalSeconds = elapsedS;
    Alert.alert(
      'End session?',
      `${formatElapsed(finalSeconds)} recorded.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            setState('active');
            startTicker();
          },
        },
        { text: 'End session', onPress: () => saveSession(finalSeconds) },
      ],
    );
  }

  async function saveSession(durationSeconds: number) {
    if (!session || !startedAt.current) return;
    setSaving(true);

    const modality  = sessionData?.modality ?? 'other';
    const startDate = startedAt.current.toISOString();
    const endDate   = new Date().toISOString();
    const phaseAtTime = cycleInfo?.phase ?? null;

    // HealthKit — fire and forget
    const HK = NativeModules.AppleHealthKit;
    if (HK?.saveWorkout) {
      HK.saveWorkout(
        { type: HK_TYPE[modality] ?? HK_TYPE.other, startDate, endDate, duration: durationSeconds },
        () => {},
      );
    }

    // Insert activity
    const { data: act, error: actErr } = await supabase
      .from('activities')
      .insert({
        user_id:            session.user.id,
        activity_type:      modality,
        started_at:         startDate,
        duration_seconds:   durationSeconds,
        phase_at_time:      phaseAtTime,
        planned_session_id: sessionId ?? null,
      })
      .select('id')
      .single();

    if (actErr) {
      Alert.alert('Save failed', `${actErr.message}. Tap Stop again to retry.`);
      setSaving(false);
      setState('paused');
      return;
    }

    // Mark planned session completed
    if (sessionId) {
      const { error: sessionErr } = await supabase
        .from('planned_sessions')
        .update({ status: 'completed', activity_id: act.id })
        .eq('id', sessionId);
      if (sessionErr) console.error('[workout-preview] failed to mark session completed', sessionErr);
    }

    cancelTrainingReminderToday();
    setSaving(false);
    router.back();
  }

  const label    = useMemo(() => sessionData
    ? sessionData.session_label.charAt(0).toUpperCase() + sessionData.session_label.slice(1).toLowerCase()
    : '', [sessionData]);
  const modality = sessionData?.modality ?? 'other';
  const steps    = useMemo(() => sessionData ? buildStepLines(sessionData) : [], [sessionData]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>
          Workout
        </VirraText>
        <View style={s.headerBtn} />
      </View>

      {state === 'loading' && (
        <View style={s.centred}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}

      {state === 'idle' && (
        <ScrollView contentContainerStyle={s.scroll}>
          <VirraCard style={{ gap: spacing.sm }}>
            <View style={s.sessionRow}>
              <SymbolView name={(MODALITY_ICON[modality] ?? 'figure.mixed.cardio') as SFSymbol} size={28} tintColor={colors.dawn} />
              <View>
                <VirraText variant="display" size={20} color={colors.breath}>{label || 'Workout'}</VirraText>
                <VirraText variant="mono" size={11} color={colors.muted}>{modality.toUpperCase()}</VirraText>
              </View>
            </View>
            {sessionData?.cycle_reason_short && (
              <VirraText variant="mono" size={11} color={colors.pulse}>
                {sessionData.cycle_adjusted_pace_secs
                  ? `${formatPace(sessionData.cycle_adjusted_pace_secs)} · `
                  : ''}
                {sessionData.cycle_reason_short.toLowerCase()}
              </VirraText>
            )}
          </VirraCard>

          {steps.length > 0 && (
            <VirraCard style={{ gap: spacing.xs, marginTop: spacing.md }}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>WORKOUT</VirraText>
              {steps.map((line, i) => (
                <View key={i} style={s.stepRow}>
                  <VirraText variant="mono" size={12} color="rgba(244,237,224,0.45)" style={{ width: 20 }}>{i + 1}</VirraText>
                  <VirraText variant="mono" size={12} color={colors.breath}>{line}</VirraText>
                </View>
              ))}
            </VirraCard>
          )}

          <Pressable style={s.ctaBtn} onPress={startTimer} accessibilityRole="button">
            <SymbolView name="play.fill" size={15} tintColor={colors.mile} />
            <VirraText variant="display" size={15} color={colors.mile} style={{ letterSpacing: 1.5 }}>{"LET'S GO"}</VirraText>
          </Pressable>
        </ScrollView>
      )}

      {(state === 'active' || state === 'paused') && (
        <View style={s.timerContainer}>
          <VirraText
            variant="display"
            size={72}
            color={state === 'paused' ? colors.muted : colors.breath}
            style={s.timerText}
          >
            {formatElapsed(elapsedS)}
          </VirraText>
          {state === 'paused' && (
            <VirraText variant="mono" size={12} color={colors.dawn} style={{ letterSpacing: 2, marginTop: -spacing.sm }}>
              PAUSED
            </VirraText>
          )}

          {steps.length > 0 && (
            <ScrollView style={s.timerSteps} contentContainerStyle={{ gap: spacing.xs }}>
              {steps.map((line, i) => (
                <VirraText key={i} variant="mono" size={11} color="rgba(244,237,224,0.4)">{line}</VirraText>
              ))}
            </ScrollView>
          )}

          <View style={s.controls}>
            {state === 'active' ? (
              <Pressable style={[s.controlBtn, s.pauseBtn]} onPress={handlePause} accessibilityRole="button">
                <VirraText variant="display" size={14} color={colors.breath} style={{ letterSpacing: 1.5 }}>PAUSE</VirraText>
              </Pressable>
            ) : (
              <Pressable style={[s.controlBtn, s.resumeBtn]} onPress={handleResume} accessibilityRole="button">
                <VirraText variant="display" size={14} color={colors.mile} style={{ letterSpacing: 1.5 }}>RESUME</VirraText>
              </Pressable>
            )}
            <Pressable style={[s.controlBtn, s.stopBtn]} onPress={handleStop} disabled={saving} accessibilityRole="button">
              {saving
                ? <ActivityIndicator color={colors.breath} size="small" />
                : <VirraText variant="display" size={14} color={colors.breath} style={{ letterSpacing: 1.5 }}>STOP</VirraText>}
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.mile },
  header:         { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:      { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  centred:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:         { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  sessionRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  ctaBtn: {
    marginTop:       spacing.lg,
    backgroundColor: colors.pulse,
    borderRadius:    radius.sm,
    paddingVertical: spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.xs,
  },
  timerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.lg },
  timerText:      { lineHeight: 80 },
  timerSteps:     { maxHeight: 120, width: '100%' },
  controls:       { flexDirection: 'row', gap: spacing.md, width: '100%' },
  controlBtn:     { flex: 1, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  pauseBtn:       { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border },
  resumeBtn:      { backgroundColor: colors.pulse },
  stopBtn:        { backgroundColor: 'rgba(255,46,126,0.18)', borderWidth: 1, borderColor: colors.heat },
});
