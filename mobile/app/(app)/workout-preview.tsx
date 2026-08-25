import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, TextInput, NativeModules, ActivityIndicator, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { cancelTrainingReminderToday, scheduleRestComplete, cancelRestComplete } from '@/lib/notifications';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraModal } from '@/components/ui/VirraModal';
import { VirraButton } from '@/components/ui/VirraButton';
import { formatPace } from '@/lib/volumePlan';
import { generateStrengthStructure } from '@/lib/strengthWorkoutGenerator';
import { normalizeStrengthSessionType } from '@/lib/strengthTypes';
import type { StrengthExercise } from '@/lib/strengthTypes';
import { getExerciseMeta } from '@/lib/exerciseLibrary';
import { getLastLoggedWeights } from '@/lib/strengthHistory';
import { getExerciseSettings, DEFAULT_LOAD_TYPE, type ExerciseSettings } from '@/lib/exerciseSettings';
import { recoverProgrammeStructure } from '@/lib/hydratePlannedSessions';
import { parseRestSeconds } from '@/lib/strengthProgramme';
import { appAlert } from '@/components/ui/VirraAlert';
import { RestTimerBar } from '@/components/ui/RestTimerBar';
import { playRestComplete } from '@/lib/restChime';
import { parseHoldTarget, formatHold, heldSeconds, holdComplete, type HoldTarget } from '@/lib/timedHold';
import {
  startRest, restartRest, restRemainingSeconds, restProgress, shouldChime,
  type RestState,
} from '@/lib/restTimer';
import type { RunWorkoutStructure, AnyStrengthStructure } from '@/lib/workoutStructure';
import { isStrengthV2 } from '@/lib/workoutStructure';

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
  week_number:              number | null;
  block_id:                 string | null;
  run_structure:            RunWorkoutStructure | null;
  strength_structure:       AnyStrengthStructure | null;
  cycle_reason_short:       string | null;
  cycle_adjusted_pace_secs: number | null;
}

// One logged set the user works through during a strength session.
interface LoggedSet {
  targetReps: number;
  actualReps: string;  // free text while editing; parsed on save
  weightKg:   string;
  done:       boolean;
}

// Normalised, render-ready view of one exercise; flattens both v1 (generated,
// tempo/description via getExerciseMeta) and v2 (authored, tempo/description
// persisted in the structure) into a single shape the logger works on.
interface LogExercise {
  id:            string;
  name:          string;
  description:   string | null;
  tempo:         string | null;
  cues:          string[];
  rest_seconds:  number;
  rest_label:    string;
  reps_label:    string;
  target_sets:   { reps: number }[];
  section:       string | null;
  section_label: string | null;
}

// Parse an authored reps string ("8", "8-10", "30s") to a numeric target for
// the logger. Non-numeric prescriptions (holds, AMRAP) default to 0 so the user
// just types the actual value.
function parseReps(reps: string | null): number {
  if (!reps) return 0;
  const m = reps.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// Flatten a strength structure (v1 or v2) into ordered LogExercise rows.
function toLogExercises(structure: AnyStrengthStructure): LogExercise[] {
  if (isStrengthV2(structure)) {
    const out: LogExercise[] = [];
    structure.sections.forEach((sec, si) => {
      sec.exercises.forEach((ex, ei) => {
        const setCount = ex.sets ?? 1;
        const reps     = parseReps(ex.reps);
        out.push({
          id:            `${si}-${ei}`,
          name:          ex.name,
          description:   ex.description,
          tempo:         ex.tempo,
          cues:          [],
          rest_seconds:  parseRestSeconds(ex.rest),
          rest_label:    ex.rest ? ex.rest.toUpperCase() : '',
          reps_label:    ex.reps ?? '—',
          target_sets:   Array.from({ length: setCount }, () => ({ reps })),
          section:       sec.section,
          section_label: sec.label,
        });
      });
    });
    return out;
  }
  return structure.exercises.map((ex) => {
    const meta = getExerciseMeta(ex.name);
    return {
      id:            ex.id,
      name:          ex.name,
      description:   meta?.description ?? null,
      tempo:         meta?.tempo ?? null,
      cues:          meta?.cues ?? [],
      rest_seconds:  ex.rest_seconds,
      rest_label:    `${ex.rest_seconds}S`,
      reps_label:    String(ex.target_sets[0]?.reps ?? 0),
      target_sets:   ex.target_sets.map((ts) => ({ reps: ts.reps })),
      section:       null,
      section_label: null,
    };
  });
}

function seedLoggedSets(exercises: LogExercise[]): Record<string, LoggedSet[]> {
  const out: Record<string, LoggedSet[]> = {};
  for (const ex of exercises) {
    out[ex.id] = ex.target_sets.map((ts) => ({
      targetReps: ts.reps,
      actualReps: '',
      weightKg:   '',
      done:       false,
    }));
  }
  return out;
}

// Fill each still-empty weight field with last session's load for that movement,
// without clobbering anything the user has already typed.
function applyPrefillWeights(
  logged: Record<string, LoggedSet[]>,
  exercises: LogExercise[],
  weights: Record<string, number>,
  settings: Record<string, ExerciseSettings>,
): Record<string, LoggedSet[]> {
  const next = { ...logged };
  for (const ex of exercises) {
    // Never carry a weight into a movement that cannot take one.
    if (settings[ex.name]?.loadType === 'none') continue;
    const w = weights[ex.name];
    if (w == null) continue;
    next[ex.id] = (next[ex.id] ?? []).map((s) =>
      s.weightKg === '' ? { ...s, weightKg: String(w) } : s);
  }
  return next;
}

// "3-1-1" → "3·1·1", "3-1-1-0" → "3·1·1·0"; passthrough for word tempos.
function prettyTempo(tempo: string): string {
  return /^[0-9-]+$/.test(tempo) ? tempo.replace(/-/g, '·') : tempo.toUpperCase();
}

// The 4-part authored tempo means lower · pause(bottom) · lift · pause(top)
// the legacy 3-part library tempo omits the top pause.
function tempoGloss(tempo: string): string {
  if (!/^[0-9-]+$/.test(tempo)) return '';
  const parts = tempo.split('-').length;
  return parts >= 4
    ? '  ·  lower · pause(bottom) · lift · pause(top) (seconds)'
    : '  ·  lower · pause · lift (seconds)';
}

// Description / cues / tempo tooltip shown from the (i) button on an exercise.
function ExerciseInfo({ exercise }: { exercise: LogExercise }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {exercise.tempo && (
        <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1 }}>
          TEMPO {prettyTempo(exercise.tempo)}{tempoGloss(exercise.tempo)}
        </VirraText>
      )}
      {exercise.description && (
        <VirraText variant="body" size={14} color={colors.breath} style={{ lineHeight: 20 }}>
          {exercise.description}
        </VirraText>
      )}
      {!!exercise.cues.length && (
        <View style={{ gap: 4, marginTop: spacing.xs }}>
          {exercise.cues.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <VirraText variant="mono" size={12} color={colors.pulse}>·</VirraText>
              <VirraText variant="body" size={13} color="rgba(244,237,224,0.7)">{c}</VirraText>
            </View>
          ))}
        </View>
      )}
      <VirraText variant="mono" size={11} color={colors.muted} style={{ marginTop: spacing.xs }}>
        {exercise.target_sets.length} × {exercise.reps_label} reps · {exercise.rest_label} rest
      </VirraText>
    </View>
  );
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildStepLines(session: SessionData): string[] {
  if (session.strength_structure) {
    return toLogExercises(session.strength_structure).map(
      (e) => `${e.name}  ·  ${e.target_sets.length} × ${e.reps_label} reps`,
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

  // Strength logging state
  const [logged,       setLogged]       = useState<Record<string, LoggedSet[]>>({});
  const [infoExercise, setInfoExercise] = useState<LogExercise | null>(null);
  const [rpeOpen,      setRpeOpen]      = useState(false);
  const [rest,         setRest]         = useState<RestState | null>(null);
  const [restNow,      setRestNow]      = useState(0);
  const [settings,     setSettings]     = useState<Record<string, ExerciseSettings>>({});
  // Exercises where the user has asked to record a load on an otherwise
  // bodyweight movement (a vest, a held dumbbell).
  const [weightShown,  setWeightShown]  = useState<Record<string, boolean>>({});
  // The hold currently being timed, if any. One at a time: you cannot plank and
  // hold a split squat simultaneously.
  const [hold,         setHold]         = useState<{ exId: string; setIdx: number; startedAt: number; target: HoldTarget } | null>(null);
  const [holdNow,      setHoldNow]      = useState(0);

  // Moment the app last came to the foreground, so a rest that ran out while
  // the user was in another app can finish silently.
  const activeSinceRef = useRef(Date.now());
  const holdRef        = useRef<typeof hold>(null);
  useEffect(() => { holdRef.current = hold; }, [hold]);
  const chimedRef      = useRef(false);
  const [sessionRpe,   setSessionRpe]   = useState<number | null>(null);

  const startedAt        = useRef<Date | null>(null);
  const pausedAt         = useRef<number | null>(null);
  const pausedDurationMs = useRef(0);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) { setState('idle'); return; }
    // NOTE: cycle_reason_short / cycle_adjusted_pace_secs are computed at
    // runtime (see todaysSession.ts) and are NOT columns on planned_sessions
    // selecting them made this query error out, leaving every non-run session
    // stuck on the generic timer with no exercises.
    supabase
      .from('planned_sessions')
      .select('id, session_label, modality, week_number, block_id, run_structure, strength_structure')
      .eq('id', sessionId)
      .single()
      .then(async ({ data, error }) => {
        if (!error && data) {
          const row: SessionData = {
            ...(data as Omit<SessionData, 'cycle_reason_short' | 'cycle_adjusted_pace_secs'>),
            cycle_reason_short:       null,
            cycle_adjusted_pace_secs: null,
          };
          // Recover strength sessions saved without a structure. Prefer the
          // authored Get Strong session (join block → template → programme_id)
          // fall back to on-the-fly generation so a bare timer never shows.
          if (row.modality === 'strength' && !row.strength_structure) {
            let recovered: AnyStrengthStructure | null = null;
            if (session) {
              recovered = await recoverProgrammeStructure(
                { session_label: row.session_label, week_number: row.week_number ?? 1, block_id: row.block_id },
                session.user.id,
                supabase as any,
              ).catch(() => null);
            }
            row.strength_structure = recovered ?? generateStrengthStructure({
              session_type:           normalizeStrengthSessionType(row.session_label),
              phase:                  cycleInfo?.phase ?? null,
              recent_primary_muscles: [],
            });
          }
          setSessionData(row);
          const structure = row.strength_structure;
          if (structure) {
            const exercises = toLogExercises(structure);
            setLogged(seedLoggedSets(exercises));
            // Pre-fill each set with last session's weight, and find out which
            // movements take a weight at all. Both are keyed by exercise name.
            if (session) {
              const names = exercises.map((e) => e.name);
              Promise.all([getLastLoggedWeights(session.user.id, names), getExerciseSettings(names)])
                .then(([weights, exSettings]) => {
                  setSettings(exSettings);
                  setLogged((prev) => applyPrefillWeights(prev, exercises, weights, exSettings));
                })
                .catch(() => {});
            }
          }
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
    appAlert(
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

  // ---- Strength logging helpers ----

  function updateLoggedSet(exId: string, setIdx: number, field: 'actualReps' | 'weightKg', value: string) {
    setLogged((prev) => {
      const sets = prev[exId] ? [...prev[exId]] : [];
      if (!sets[setIdx]) return prev;
      sets[setIdx] = { ...sets[setIdx], [field]: value };
      return { ...prev, [exId]: sets };
    });
  }

  function toggleSetDone(ex: LogExercise, setIdx: number) {
    const nextDone = !(logged[ex.id]?.[setIdx]?.done ?? false);
    setLogged((prev) => {
      const sets = prev[ex.id] ? [...prev[ex.id]] : [];
      if (!sets[setIdx]) return prev;
      // On completing a set, default empty reps to the target so a quick tap
      // records a "did as prescribed" set. Carry the weight to the next set.
      const actualReps = nextDone && sets[setIdx].actualReps === ''
        ? String(sets[setIdx].targetReps)
        : sets[setIdx].actualReps;
      sets[setIdx] = { ...sets[setIdx], done: nextDone, actualReps };
      if (nextDone && sets[setIdx + 1] && sets[setIdx + 1].weightKg === '' && sets[setIdx].weightKg !== '') {
        sets[setIdx + 1] = { ...sets[setIdx + 1], weightKg: sets[setIdx].weightKg };
      }
      return { ...prev, [ex.id]: sets };
    });
    // Ticking a set off starts that movement's authored rest. Unticking a set
    // (correcting a mistap) should not.
    if (nextDone) beginRest(ex);
  }

  /**
   * Time the next set of this exercise that has not been completed. A plank is
   * done with the phone down, so the user taps once, holds, and taps again;
   * asking them to aim at a particular row first would be fiddly.
   */
  function startHold(ex: LogExercise, target: HoldTarget) {
    const sets   = logged[ex.id] ?? [];
    const setIdx = sets.findIndex((st) => !st.done);
    if (setIdx === -1) return;                 // every set already logged
    setHold({ exId: ex.id, setIdx, startedAt: Date.now(), target });
    setHoldNow(Date.now());
  }

  /** Stop the running hold, record the seconds held, and tick the set off. */
  function stopHold() {
    const current = holdRef.current;
    if (!current) return;
    const held = heldSeconds(current.startedAt, Date.now(), current.target);
    setHold(null);
    if (held <= 0) return;
    setLogged((prev) => {
      const sets = prev[current.exId] ? [...prev[current.exId]] : [];
      if (!sets[current.setIdx]) return prev;
      sets[current.setIdx] = { ...sets[current.setIdx], actualReps: String(held), done: true };
      return { ...prev, [current.exId]: sets };
    });
  }

  function beginRest(ex: LogExercise) {
    const next = startRest(ex.id, ex.name, ex.rest_seconds, Date.now());
    if (!next) return;   // mobility and activation carry no authored rest
    chimedRef.current = false;
    setRest(next);
    setRestNow(Date.now());
    // iOS suspends the JS runtime in the background, so the in-app chime cannot
    // reach someone who has switched away. A scheduled notification can. Card 197.
    void scheduleRestComplete(ex.name, next.endsAt);
  }

  // A set is logged once the user checks it off. (We no longer treat a filled
  // field as "logged" because weights are now pre-populated from last session
  // an untouched pre-filled set shouldn't be recorded as done.)
  function isSetLogged(s: LoggedSet): boolean {
    return s.done;
  }

  // The back chevron sits within thumb reach of the set inputs, so an accidental
  // tap used to drop the whole session. Confirm before leaving a live workout
  // outside one it stays a plain back.
  function handleClose() {
    if (state !== 'active' && state !== 'paused') { router.back(); return; }
    appAlert(
      'Leave this workout?',
      'Your logged sets will not be saved.',
      [
        { text: 'Keep going',       style: 'cancel' },
        { text: 'Discard workout',  style: 'destructive', onPress: () => router.back() },
      ],
    );
  }

  function handleFinishStrength() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRpeOpen(true);
  }

  async function saveSession(durationSeconds: number, rpe: number | null = null) {
    if (!session || !startedAt.current) return;
    setSaving(true);

    const modality  = sessionData?.modality ?? 'other';
    const startDate = startedAt.current.toISOString();
    const endDate   = new Date().toISOString();
    const phaseAtTime = cycleInfo?.phase ?? null;

    // HealthKit: fire and forget
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
      appAlert('Save failed', `${actErr.message}. Tap Finish again to retry.`);
      setSaving(false);
      setState('active');
      return;
    }

    // Strength: persist per-set logs (relational) + the strength sidecar
    // (roll-up blob + session RPE). Best-effort; a logging failure must not
    // block completing the session.
    const structure = sessionData?.strength_structure;
    if (structure && modality === 'strength') {
      const setRows: Record<string, unknown>[] = [];
      const rollup: StrengthExercise[] = [];
      for (const ex of toLogExercises(structure)) {
        const done = (logged[ex.id] ?? [])
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => isSetLogged(s));
        if (done.length === 0) continue;
        for (const { s, i } of done) {
          const reps   = parseInt(s.actualReps, 10);
          const weight = parseFloat(s.weightKg);
          setRows.push({
            user_id:            session.user.id,
            activity_id:        act.id,
            planned_session_id: sessionId ?? null,
            exercise_id:        ex.id,
            exercise_name:      ex.name,
            set_index:          i,
            target_reps:        s.targetReps,
            actual_reps:        Number.isFinite(reps)   ? reps   : null,
            weight_kg:          Number.isFinite(weight) ? weight : null,
            // A 30 second plank must not read as 30 reps later on.
            unit:               parseHoldTarget(ex.reps_label) ? 'seconds' : 'reps',
          });
        }
        rollup.push({
          name: ex.name,
          sets: done.map(({ s }) => {
            const reps   = parseInt(s.actualReps, 10);
            const weight = parseFloat(s.weightKg);
            return {
              reps:      Number.isFinite(reps)   ? reps   : s.targetReps,
              weight_kg: Number.isFinite(weight) ? weight : 0,
            };
          }),
        });
      }
      if (setRows.length > 0) {
        const { error: logErr } = await supabase.from('strength_set_logs').insert(setRows);
        if (logErr) console.error('[workout-preview] failed to insert set logs', logErr);
      }
      const { error: detErr } = await supabase.from('strength_details').insert({
        activity_id:    act.id,
        session_type:   structure.session_type,
        exercises_json: rollup,
        session_rpe:    rpe,
      });
      if (detErr) console.error('[workout-preview] failed to insert strength details', detErr);
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
  const strengthStructure = sessionData?.strength_structure ?? null;
  const logExercises = useMemo(
    () => strengthStructure ? toLogExercises(strengthStructure) : [],
    [strengthStructure],
  );
  const deloadNote = isStrengthV2(strengthStructure) ? strengthStructure.deload_note ?? null : null;
  const restRemaining = restRemainingSeconds(rest, restNow);
  const restDone      = !!rest && restRemaining === 0;

  // Recompute from the clock rather than counting down, so a suspended JS timer
  // (backgrounded app) cannot make the display drift.
  useEffect(() => {
    if (!rest) return;
    setRestNow(Date.now());
    const id = setInterval(() => setRestNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest]);

  // Same clock-based approach as the rest timer, so a hold keeps counting while
  // the user is in another app and reads correctly when they come back.
  useEffect(() => {
    if (!hold) return;
    setHoldNow(Date.now());
    const id = setInterval(() => setHoldNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [hold]);

  // Reaching the top of the range stops the hold and records it, so the user
  // does not have to watch the screen to finish a plank.
  useEffect(() => {
    if (!hold || !holdComplete(hold.startedAt, holdNow, hold.target)) return;
    playRestComplete();
    stopHold();
  }, [hold, holdNow]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') activeSinceRef.current = Date.now();
    });
    return () => sub.remove();
  }, []);

  // Leaving the screen mid-rest must not leave an alert queued: finishing the
  // workout and then being told to start your next set is worse than no alert
  // at all. Card 197.
  useEffect(() => () => { void cancelRestComplete(); }, []);

  useEffect(() => {
    if (!rest || !restDone || chimedRef.current) return;
    chimedRef.current = true;
    // shouldChime stays: a rest that ran out while the user was away must not
    // chime on return, or they get an alert for something that ended twenty
    // minutes ago. The notification is what covers that case instead.
    if (shouldChime(rest, activeSinceRef.current)) playRestComplete();
    // It has fired, or it is about to and would be redundant now they are here.
    void cancelRestComplete();
    const id = setTimeout(() => setRest(null), 3000);
    return () => clearTimeout(id);
  }, [rest, restDone]);

  const isLogging = (state === 'active' || state === 'paused') && !!strengthStructure;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
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

          {deloadNote && (
            <VirraCard style={{ gap: spacing.xs, marginTop: spacing.md }}>
              <VirraText variant="mono" size={11} color="#5BA4CF" style={{ letterSpacing: 1.5 }}>DELOAD WEEK</VirraText>
              <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={{ lineHeight: 20 }}>
                {deloadNote}
              </VirraText>
            </VirraCard>
          )}

          {strengthStructure ? (
            <VirraCard style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>WORKOUT</VirraText>
              {logExercises.map((ex, i) => {
                const showHeader = !!ex.section_label &&
                  (i === 0 || logExercises[i - 1].section !== ex.section);
                return (
                  <React.Fragment key={ex.id}>
                    {showHeader && (
                      <VirraText variant="mono" size={10} color={colors.dawn} style={{ letterSpacing: 1.5, marginTop: i === 0 ? 0 : spacing.xs }}>
                        {ex.section_label!.toUpperCase()}
                      </VirraText>
                    )}
                    <View style={s.exListRow}>
                      <VirraText variant="mono" size={12} color="rgba(244,237,224,0.4)" style={s.exListNum}>{i + 1}</VirraText>
                      <VirraText variant="mono" size={12} color={colors.breath} style={s.exListName} numberOfLines={1}>{ex.name}</VirraText>
                      <VirraText variant="mono" size={12} color="rgba(244,237,224,0.55)" style={s.exListReps}>
                        {ex.target_sets.length} × {ex.reps_label} reps
                      </VirraText>
                    </View>
                  </React.Fragment>
                );
              })}
            </VirraCard>
          ) : steps.length > 0 ? (
            <VirraCard style={{ gap: spacing.xs, marginTop: spacing.md }}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>WORKOUT</VirraText>
              {steps.map((line, i) => (
                <View key={i} style={s.stepRow}>
                  <VirraText variant="mono" size={12} color="rgba(244,237,224,0.45)" style={{ width: 20 }}>{i + 1}</VirraText>
                  <VirraText variant="mono" size={12} color={colors.breath}>{line}</VirraText>
                </View>
              ))}
            </VirraCard>
          ) : null}

          <Pressable style={s.ctaBtn} onPress={startTimer} accessibilityRole="button">
            <SymbolView name="play.fill" size={15} tintColor={colors.mile} />
            <VirraText variant="display" size={15} color={colors.mile} style={{ letterSpacing: 1.5 }}>{"LET'S GO"}</VirraText>
          </Pressable>
        </ScrollView>
      )}

      {/* Strength: log every set / rep */}
      {isLogging && strengthStructure && (
        <View style={{ flex: 1 }}>
          <View style={s.logHeader}>
            <View style={s.logTimer}>
              <SymbolView name="timer" size={13} tintColor={colors.muted} />
              <VirraText variant="mono" size={14} color={colors.breath}>{formatElapsed(elapsedS)}</VirraText>
            </View>
            <Pressable style={s.finishBtn} onPress={handleFinishStrength} disabled={saving} accessibilityRole="button">
              <VirraText variant="display" size={13} color={colors.mile} style={{ letterSpacing: 1.5 }}>END WORKOUT</VirraText>
            </Pressable>
          </View>

          {rest && (
            <RestTimerBar
              exerciseName={rest.exerciseName}
              remainingSeconds={restRemaining}
              progress={restProgress(rest, restNow)}
              done={restDone}
              onSkip={() => { void cancelRestComplete(); setRest(null); }}
              onRestart={() => {
                chimedRef.current = false;
                const restarted = restartRest(rest, Date.now());
                setRest(restarted);
                void scheduleRestComplete(restarted.exerciseName, restarted.endsAt);
              }}
            />
          )}

          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {deloadNote && (
              <VirraCard style={{ gap: spacing.xs, marginBottom: spacing.md }}>
                <VirraText variant="mono" size={10} color="#5BA4CF" style={{ letterSpacing: 1.5 }}>DELOAD WEEK</VirraText>
                <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={{ lineHeight: 20 }}>
                  {deloadNote}
                </VirraText>
              </VirraCard>
            )}
            {logExercises.map((ex, i) => {
              const hasInfo = !!ex.description || !!ex.tempo || ex.cues.length > 0;
              const sets = logged[ex.id] ?? [];
              // A kg field on a stretch or a jump is noise. Loaded movements
              // always show one; bodyweight movements people sometimes load
              // offer one on request; the rest have none at all.
              const exSettings   = settings[ex.name];
              const loadType     = exSettings?.loadType ?? DEFAULT_LOAD_TYPE;
              const showWeight   = loadType === 'weighted' || (loadType === 'optional' && !!weightShown[ex.id]);
              const canAddWeight = loadType === 'optional' && !weightShown[ex.id];
              // The exercise-level tempo is the editable one; the tempo authored
              // on the session is the fallback for the few that vary by block.
              const tempo        = exSettings?.defaultTempo ?? ex.tempo;
              // Prescriptions like "20-40 sec" are a hold, not a rep count.
              const holdTarget  = parseHoldTarget(ex.reps_label);
              const holdRunning = hold?.exId === ex.id;
              const allSetsDone = sets.length > 0 && sets.every((st) => st.done);
              const showHeader = !!ex.section_label &&
                (i === 0 || logExercises[i - 1].section !== ex.section);
              return (
                <React.Fragment key={ex.id}>
                {showHeader && (
                  <VirraText variant="mono" size={11} color={colors.dawn} style={{ letterSpacing: 1.5, marginBottom: spacing.xs }}>
                    {ex.section_label!.toUpperCase()}
                  </VirraText>
                )}
                <VirraCard style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                  <View style={s.exHeader}>
                    <View style={{ flex: 1 }}>
                      <VirraText variant="display" size={17} color={colors.breath}>{ex.name}</VirraText>
                      <View style={s.exMetaRow}>
                        <VirraText variant="mono" size={10} color={colors.breath} style={{ letterSpacing: 1 }}>
                          REPS {ex.reps_label}
                        </VirraText>
                        {tempo && (
                          <VirraText variant="mono" size={10} color={colors.pulse} style={{ letterSpacing: 1 }}>
                            TEMPO {prettyTempo(tempo)}
                          </VirraText>
                        )}
                        {ex.rest_label && (
                          <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1 }}>
                            REST {ex.rest_label}
                          </VirraText>
                        )}
                      </View>
                    </View>
                    {hasInfo && (
                      <Pressable onPress={() => setInfoExercise(ex)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${ex.name} description`}>
                        <SymbolView name="info.circle" size={20} tintColor={colors.muted} />
                      </Pressable>
                    )}
                  </View>

                  <View style={s.setHeaderRow}>
                    <VirraText variant="mono" size={10} color={colors.muted} style={s.colSet}>SET</VirraText>
                    <VirraText variant="mono" size={10} color={colors.muted} style={s.colInput}>REPS</VirraText>
                    {showWeight && (
                      <VirraText variant="mono" size={10} color={colors.muted} style={s.colInput}>KG</VirraText>
                    )}
                    <View style={s.colDone} />
                  </View>

                  {sets.map((st, i) => (
                    <View key={i} style={s.setRow}>
                      <VirraText variant="mono" size={14} color={colors.muted} style={s.colSet}>{i + 1}</VirraText>
                      <TextInput
                        style={[s.setInput, s.colInput, st.done && s.setInputDone]}
                        value={st.actualReps}
                        onChangeText={(v) => updateLoggedSet(ex.id, i, 'actualReps', v)}
                        placeholder={String(st.targetReps)}
                        placeholderTextColor="rgba(244,237,224,0.3)"
                        keyboardType="number-pad"
                        maxLength={3}
                      />
                      {showWeight && (
                        <TextInput
                          style={[s.setInput, s.colInput, st.done && s.setInputDone]}
                          value={st.weightKg}
                          onChangeText={(v) => updateLoggedSet(ex.id, i, 'weightKg', v)}
                          placeholder="0"
                          placeholderTextColor="rgba(244,237,224,0.3)"
                          keyboardType="decimal-pad"
                          maxLength={6}
                          accessibilityLabel={`${ex.name} set ${i + 1} weight in kilograms`}
                        />
                      )}
                      <Pressable style={s.colDone} onPress={() => toggleSetDone(ex, i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Complete ${ex.name} set ${i + 1}`}>
                        <SymbolView name={st.done ? 'checkmark.circle.fill' : 'circle'} size={24} tintColor={st.done ? colors.pulse : colors.muted} />
                      </Pressable>
                    </View>
                  ))}

                  {canAddWeight && (
                    <Pressable
                      onPress={() => setWeightShown((prev) => ({ ...prev, [ex.id]: true }))}
                      hitSlop={8}
                      style={s.addWeightBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Add weight to ${ex.name}`}
                    >
                      <SymbolView name="plus" size={11} tintColor={colors.muted} />
                      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1 }}>
                        ADD WEIGHT
                      </VirraText>
                    </Pressable>
                  )}

                  {holdTarget && !allSetsDone && (
                    <Pressable
                      onPress={() => (holdRunning ? stopHold() : startHold(ex, holdTarget))}
                      style={[s.holdBtn, holdRunning && s.holdBtnRunning]}
                      accessibilityRole="button"
                      accessibilityLabel={holdRunning ? `Stop timing ${ex.name}` : `Time ${ex.name}`}
                    >
                      <SymbolView
                        name={holdRunning ? 'stop.fill' : 'timer'}
                        size={14}
                        tintColor={holdRunning ? colors.mile : colors.pulse}
                      />
                      <VirraText
                        variant="mono"
                        size={12}
                        color={holdRunning ? colors.mile : colors.pulse}
                        style={{ letterSpacing: 1 }}
                      >
                        {holdRunning
                          ? `${formatHold(heldSeconds(hold!.startedAt, holdNow, hold!.target))}  ·  TAP TO STOP`
                          : `TIME THIS HOLD  ·  ${ex.reps_label.toUpperCase()}`}
                      </VirraText>
                    </Pressable>
                  )}
                </VirraCard>
                </React.Fragment>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Timer-only: yoga / other (no structure) */}
      {(state === 'active' || state === 'paused') && !strengthStructure && (
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

      {/* Exercise description / cues / tempo */}
      <VirraModal visible={!!infoExercise} onClose={() => setInfoExercise(null)} title={infoExercise?.name ?? ''}>
        {infoExercise && <ExerciseInfo exercise={infoExercise} />}
      </VirraModal>

      {/* Session RPE on finish */}
      <VirraModal visible={rpeOpen} onClose={() => { if (!saving) setRpeOpen(false); }} title="How hard was that?">
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          Rate the whole session. 1 is easy, 10 is max effort.
        </VirraText>
        <View style={s.rpeGrid}>
          {[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].map((row, ri) => (
            <View key={ri} style={s.rpeRow}>
              {row.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setSessionRpe(n)}
                  style={[s.rpeChip, sessionRpe === n && s.rpeChipSel]}
                  accessibilityRole="button"
                  accessibilityLabel={`RPE ${n}`}
                >
                  <VirraText variant="mono" size={14} color={sessionRpe === n ? colors.mile : colors.breath}>{n}</VirraText>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
        <VirraButton
          label="SAVE SESSION"
          onPress={() => { setRpeOpen(false); saveSession(elapsedS, sessionRpe); }}
          loading={saving}
          style={{ marginTop: spacing.sm }}
        />
      </VirraModal>
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
  exListRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exListNum:      { width: 18 },
  exListName:     { flex: 1 },
  exListReps:     { textAlign: 'right' },
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
  // Strength logging
  logHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  logTimer:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  finishBtn:  { backgroundColor: colors.pulse, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  exHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  exMetaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  setRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colSet:     { width: 28, textAlign: 'center' },
  colInput:   { flex: 1, textAlign: 'center' },
  colDone:    { width: 32, alignItems: 'center', justifyContent: 'center' },
  setInput: {
    backgroundColor: colors.mile, borderWidth: 1, borderColor: colors.control,
    borderRadius: radius.sm, paddingVertical: spacing.sm, color: colors.breath,
    fontFamily: fonts.mono, fontSize: 15,
  },
  setInputDone: { borderColor: colors.pulse },
  addWeightBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingTop: spacing.xs },
  holdBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    marginTop: spacing.xs, paddingVertical: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.pulse,
  },
  holdBtnRunning: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  rpeGrid:    { gap: spacing.xs, marginVertical: spacing.md },
  rpeRow:     { flexDirection: 'row', gap: spacing.xs },
  rpeChip: {
    flex: 1, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.control,
  },
  rpeChipSel: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  timerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.lg },
  timerText:      { lineHeight: 80 },
  timerSteps:     { maxHeight: 120, width: '100%' },
  controls:       { flexDirection: 'row', gap: spacing.md, width: '100%' },
  controlBtn:     { flex: 1, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  pauseBtn:       { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.control },
  resumeBtn:      { backgroundColor: colors.pulse },
  stopBtn:        { backgroundColor: 'rgba(255,46,126,0.18)', borderWidth: 1, borderColor: colors.heat },
});
