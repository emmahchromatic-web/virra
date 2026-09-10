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
import { useSessionStore } from '@/store/sessionStore';
import { useProfileStore } from '@/store/profile';
import { hasEquipmentPreference } from '@/lib/getStrongSession';
import { EquipmentChooser } from '@/components/ui/EquipmentChooser';
import { cancelTrainingReminderToday, scheduleRestComplete, cancelRestComplete } from '@/lib/notifications';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraModal } from '@/components/ui/VirraModal';
import { InlineError } from '@/components/ui/InlineError';
import { VirraButton } from '@/components/ui/VirraButton';
import { formatPace } from '@/lib/volumePlan';
import { generateStrengthStructure } from '@/lib/strengthWorkoutGenerator';
import { normalizeStrengthSessionType } from '@/lib/strengthTypes';
import type { StrengthExercise } from '@/lib/strengthTypes';
import { getExerciseMeta } from '@/lib/exerciseLibrary';
import { isSetAsideCandidate, setAsideReason } from '@/lib/menstrualSetAside';
import { getLastLoggedWeights } from '@/lib/strengthHistory';
import { getExerciseSettings, DEFAULT_LOAD_TYPE, type ExerciseSettings } from '@/lib/exerciseSettings';
import { recoverProgrammeStructure } from '@/lib/hydratePlannedSessions';
import { parseRestSeconds } from '@/lib/strengthProgramme';
import { appAlert } from '@/components/ui/VirraAlert';
import { RestTimerBar } from '@/components/ui/RestTimerBar';
import { playRestComplete } from '@/lib/restChime';
import { parseHoldTarget, formatHold, heldSeconds, holdComplete, type HoldTarget } from '@/lib/timedHold';
import {
  startRest, restartRest, restRemainingSeconds, restProgress, shouldChime, restCompleteBody,
  type RestState,
} from '@/lib/restTimer';
import type { RunWorkoutStructure, AnyStrengthStructure } from '@/lib/workoutStructure';
import { isStrengthV2 } from '@/lib/workoutStructure';
import { saveWorkoutDraft, loadWorkoutDraft, deleteWorkoutDraft } from '@/lib/workoutDrafts';
import { enqueueCompletion } from '@/lib/pendingCompletions';

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

/**
 * Card 258. Read the session from the network, and fall back to the copy the
 * session store already holds.
 *
 * The previous version had no fallback and no failure branch: the query result
 * was handled inside `if (!error && data)` with nothing after it, so with no
 * signal the screen simply never populated and said nothing about why. A gym
 * with no signal and no wifi is exactly where someone opens this screen, which
 * made the one place it had to work the one place it could not.
 *
 * Network first rather than cache first: a session can be moved, dropped or
 * regenerated, and the cache is a fallback rather than a source of truth. The
 * store persists to `virra:sessions:v1`, so the row is usually already on the
 * phone from the training tab that got the user here.
 *
 * Everything downstream already degrades correctly offline:
 * `recoverProgrammeStructure` catches to null and generation is local, and the
 * weight prefill catches its own failure.
 */
async function loadSessionRow(sessionId: string): Promise<{ row: SessionData; fromCache: boolean } | null> {
  const { data, error } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, week_number, block_id, run_structure, strength_structure')
    .eq('id', sessionId)
    .single();

  if (!error && data) {
    return {
      row: {
        ...(data as Omit<SessionData, 'cycle_reason_short' | 'cycle_adjusted_pace_secs'>),
        cycle_reason_short:       null,
        cycle_adjusted_pace_secs: null,
      },
      fromCache: false,
    };
  }

  const cached = useSessionStore.getState().byId[sessionId];
  if (!cached) return null;

  return {
    row: {
      id:                       cached.id,
      session_label:            cached.session_label ?? '',
      modality:                 cached.modality,
      week_number:              cached.week_number ?? null,
      block_id:                 cached.block_id,
      run_structure:            (cached.run_structure ?? null) as SessionData['run_structure'],
      strength_structure:       (cached.strength_structure ?? null) as SessionData['strength_structure'],
      cycle_reason_short:       null,
      cycle_adjusted_pace_secs: null,
    },
    fromCache: true,
  };
}

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
  /** Core-led or explosive: a candidate for setting aside on the worst days. */
  sensitive:     boolean;
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
          sensitive:     isSetAsideCandidate(getExerciseMeta(ex.name)?.primaryMuscles, ex.tempo),
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
      sensitive:     isSetAsideCandidate(meta?.primaryMuscles, meta?.tempo ?? null),
    };
  });
}

/**
 * Core and explosive work moved to the bottom of the session on the roughest
 * days, with the reason attached and a tap to put it back.
 *
 * Emma's rule, 2026-09-10: set them aside on the heaviest and most
 * uncomfortable days, but let the user see them and reactivate them, because
 * every woman is different. So this is a suggestion the user can overrule, not
 * a decision taken on her behalf. Nothing is removed from the structure and
 * nothing is silently swapped: the sets are already seeded, so putting one back
 * costs nothing and loses nothing.
 */
function SetAsideGroup({ exercises, reason, onRestore }: {
  exercises: LogExercise[];
  reason:    string;
  onRestore: (id: string) => void;
}) {
  if (!exercises.length) return null;
  return (
    <VirraCard style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <VirraText variant="mono" size={10} color={colors.dawn} style={{ letterSpacing: 1.5 }}>
        SET ASIDE FOR TODAY
      </VirraText>
      <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={{ lineHeight: 20 }}>
        {reason} Core and explosive work can be uncomfortable on these days, so we have moved it
        out of your way. Add anything back if you want it.
      </VirraText>
      {exercises.map((ex) => (
        <View key={ex.id} style={s.asideRow}>
          <View style={{ flex: 1 }}>
            <VirraText variant="bodyMedium" size={14} color={colors.breath}>{ex.name}</VirraText>
            <VirraText variant="mono" size={10} color={colors.muted}>
              {ex.target_sets.length} x {ex.reps_label}
            </VirraText>
          </View>
          <Pressable
            onPress={() => onRestore(ex.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Add ${ex.name} back to the workout`}
            style={s.asideBtn}
          >
            <VirraText variant="mono" size={10} color={colors.pulse} style={{ letterSpacing: 1 }}>
              ADD BACK
            </VirraText>
          </Pressable>
        </View>
      ))}
    </VirraCard>
  );
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
  // Card 215's bug class, fifth instance. saveSession runs from inside the RPE
  // sheet, which is a VirraModal, so an appAlert raised from here presents a
  // second native modal from a view controller that already has one and renders
  // NOTHING. Emma tapped End workout, the button blinked and nothing happened:
  // that was setSaving(false) un-spinning it while the error went nowhere.
  // Errors that keep the user here must be inline.
  const [rpeError, setRpeError] = useState<{ title: string; message: string } | null>(null);
  // Today's check-in, read so core and explosive work can be set aside on the
  // days the user has told us are rough rather than on the calendar alone.
  const [checkin, setCheckin] = useState<{ energy: number; symptoms: string[] } | null>(null);
  // Exercises the user has put back. Emma's rule: every woman is different, so
  // the app suggests and she decides.
  const [reactivated, setReactivated] = useState<Set<string>>(new Set());
  // Card 258. Loading this screen used to have no failure branch at all.
  const [loadError, setLoadError] = useState<{ title: string; message: string } | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  // Bumped when the equipment answer arrives, so the session is re-read and the
  // authored variant can be recovered instead of the generic fallback.
  const [reloadKey, setReloadKey] = useState(0);
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

  // Persists logged-set progress so an interrupted session (crash, OS kill,
  // backgrounding) resurfaces where it left off instead of losing everything —
  // see the workout-drafts Trello card. Fire-and-forget: a failed draft save
  // must never block the live workout.
  function persistDraft(loggedSnapshot: Record<string, LoggedSet[]>, rpe: number | null) {
    if (!session || !sessionId || !startedAt.current) return;
    saveWorkoutDraft(
      session.user.id,
      sessionId,
      sessionData?.modality ?? 'other',
      startedAt.current.toISOString(),
      Math.round(pausedDurationMs.current / 1000),
      { logged: loggedSnapshot, sessionRpe: rpe },
    ).catch(() => {});
  }

  useEffect(() => {
    if (!sessionId) { setState('idle'); return; }
    // NOTE: cycle_reason_short / cycle_adjusted_pace_secs are computed at
    // runtime (see todaysSession.ts) and are NOT columns on planned_sessions
    // selecting them made this query error out, leaving every non-run session
    // stuck on the generic timer with no exercises.
    let cancelled = false;
    (async () => {
        const loaded = await loadSessionRow(sessionId);
        if (cancelled) return;
        if (loaded) {
          const { row, fromCache } = loaded;
          setLoadedFromCache(fromCache);
          setLoadError(null);
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

          // If a draft exists for this exact session, the user is reopening
          // an interrupted workout — resume from it instead of starting fresh.
          let resumed = false;
          if (session) {
            const draft = await loadWorkoutDraft(session.user.id);
            if (draft && draft.plannedSessionId === sessionId) {
              const payload = draft.draft as { logged?: Record<string, LoggedSet[]>; sessionRpe?: number | null };
              if (payload.logged) setLogged(payload.logged);
              setSessionRpe(payload.sessionRpe ?? null);
              startedAt.current        = new Date(draft.startedAt);
              pausedDurationMs.current = draft.pausedSeconds * 1000;
              resumed = true;
              setState('active');
              // Real elapsed time immediately, not just from the next tick —
              // if the app was closed for 20 minutes the timer shouldn't
              // flash 00:00 before jumping.
              setElapsedS(Math.floor((Date.now() - startedAt.current.getTime() - pausedDurationMs.current) / 1000));
              startTicker();
            }
          }

          if (structure && !resumed) {
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
          if (!resumed) setState('idle');
          return;
        }
        // Neither the network nor the cache has it. Say so, rather than
        // leaving an empty screen the user cannot act on.
        setLoadError({
          title:   'Could not open this session',
          message: 'We could not reach the server and this workout is not saved on your phone yet. Open it once with signal and it will be available offline.',
        });
        setState('idle');
    })();
    return () => { cancelled = true; };
  }, [sessionId, reloadKey]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const today = new Date().toLocaleDateString('en-CA');
    void supabase
      .from('symptom_logs')
      .select('energy, symptoms')
      .eq('user_id', session.user.id)
      .eq('recorded_on', today)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCheckin({
          energy:   typeof data.energy === 'number' ? data.energy : 3,
          symptoms: Array.isArray(data.symptoms) ? data.symptoms : [],
        });
      });
    return () => { cancelled = true; };
  }, [session]);

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
    persistDraft(logged, sessionRpe);
  }

  function handlePause() {
    if (timerRef.current) clearInterval(timerRef.current);
    pausedAt.current = Date.now();
    setState('paused');
    persistDraft(logged, sessionRpe);
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
    const sets = logged[ex.id] ? [...logged[ex.id]] : [];
    if (!sets[setIdx]) return;
    // On completing a set, default empty reps to the target so a quick tap
    // records a "did as prescribed" set. Carry the weight to the next set.
    const actualReps = nextDone && sets[setIdx].actualReps === ''
      ? String(sets[setIdx].targetReps)
      : sets[setIdx].actualReps;
    sets[setIdx] = { ...sets[setIdx], done: nextDone, actualReps };
    if (nextDone && sets[setIdx + 1] && sets[setIdx + 1].weightKg === '' && sets[setIdx].weightKg !== '') {
      sets[setIdx + 1] = { ...sets[setIdx + 1], weightKg: sets[setIdx].weightKg };
    }
    const next = { ...logged, [ex.id]: sets };
    setLogged(next);
    // A logged set is exactly the moment worth persisting — losing everything
    // since the last tick is a much smaller gap than losing the whole session.
    persistDraft(next, sessionRpe);
    // Ticking a set off starts that movement's authored rest. Unticking a set
    // (correcting a mistap) should not.
    if (nextDone) beginRest(ex, next);
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
    const sets = logged[current.exId] ? [...logged[current.exId]] : [];
    if (!sets[current.setIdx]) return;
    sets[current.setIdx] = { ...sets[current.setIdx], actualReps: String(held), done: true };
    const next = { ...logged, [current.exId]: sets };
    setLogged(next);
    persistDraft(next, sessionRpe);
  }

  function restoreSetAside(id: string) {
    setReactivated((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function beginRest(ex: LogExercise, loggedNow: Record<string, LoggedSet[]>) {
    const next = startRest(ex.id, ex.name, ex.rest_seconds, Date.now());
    if (!next) return;   // mobility and activation carry no authored rest
    chimedRef.current = false;
    setRest(next);
    setRestNow(Date.now());

    // Rest starts after EVERY set, the last one included, so the notification
    // cannot assume another set of the same movement is coming. Work out what
    // actually follows: another set here, the next exercise, or nothing.
    const setsLeft   = (loggedNow[ex.id] ?? []).filter((st) => !st.done).length;
    const idx        = logExercises.findIndex((e) => e.id === ex.id);
    const upNext     = idx >= 0
      ? logExercises.slice(idx + 1).find((e) => (loggedNow[e.id] ?? []).some((st) => !st.done)) ?? null
      : null;

    // iOS suspends the JS runtime in the background, so the in-app chime cannot
    // reach someone who has switched away. A scheduled notification can. Card 197.
    void scheduleRestComplete(restCompleteBody(ex.name, setsLeft, upNext?.name ?? null), next.endsAt);
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
        {
          text: 'Discard workout', style: 'destructive', onPress: () => {
            if (session) deleteWorkoutDraft(session.user.id).catch(() => {});
            router.back();
          },
        },
      ],
    );
  }

  function handleFinishStrength() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRpeOpen(true);
  }

  /**
   * The per-set rows and the roll-up, built without `activity_id` so the same
   * payload works online and from the offline queue. Card 253.
   */
  function buildStrengthRows(): { setRows: Record<string, unknown>[]; rollup: StrengthExercise[] } {
    const setRows: Record<string, unknown>[] = [];
    const rollup: StrengthExercise[] = [];
    const structure = sessionData?.strength_structure;
    if (!structure || sessionData?.modality !== 'strength') return { setRows, rollup };

    for (const ex of toLogExercises(structure)) {
      const done = (logged[ex.id] ?? [])
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => isSetLogged(s));
      if (done.length === 0) continue;
      for (const { s, i } of done) {
        const reps   = parseInt(s.actualReps, 10);
        const weight = parseFloat(s.weightKg);
        setRows.push({
          user_id:            session!.user.id,
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
    return { setRows, rollup };
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

    // Built once so the offline queue sends exactly what the online path would.
    const activityRow = {
      user_id:            session.user.id,
      activity_type:      modality,
      started_at:         startDate,
      duration_seconds:   durationSeconds,
      phase_at_time:      phaseAtTime,
      planned_session_id: sessionId ?? null,
    };

    // Set logs and the roll-up carry activity_id, which does not exist until
    // the insert succeeds, so they are built WITHOUT it and the id is stamped
    // on at write time. That is what lets the same payload be queued.
    const { setRows, rollup } = buildStrengthRows();
    const detailsRow = sessionData?.strength_structure && modality === 'strength'
      ? {
          session_type:   sessionData.strength_structure.session_type,
          exercises_json: rollup,
          session_rpe:    rpe,
        }
      : null;

    const { data: act, error: actErr } = await supabase
      .from('activities')
      .insert(activityRow)
      .select('id')
      .single();

    if (actErr) {
      // Card 253. "Tap Finish again to retry" cannot succeed with no signal, so
      // this told someone in a gym basement to keep pressing a button that
      // would never work, for the rest of their session. The draft meant the
      // data was safe, but the workout could not be FINISHED, which is what
      // Emma hit.
      //
      // Queue the whole completion and let them finish. It replays on the next
      // foreground, and `activities` is unique on (user_id, started_at) so a
      // retry cannot duplicate the session.
      await enqueueCompletion(session.user.id, {
        kind:      'strength',
        queuedAt:  new Date().toISOString(),
        sessionId: sessionId ?? null,
        activity:  activityRow,
        setRows,
        details:   detailsRow,
      });
      deleteWorkoutDraft(session.user.id).catch(() => {});
      cancelTrainingReminderToday();
      // Close the sheet BEFORE alerting, or this alert is invisible for exactly
      // the same reason the old one was.
      setRpeOpen(false);
      setRpeError(null);
      setSaving(false);
      router.back();
      appAlert(
        'Saved on your phone',
        'You are offline, so this workout will sync as soon as you have signal. Nothing is lost.',
      );
      return;
    }

    // Strength: persist per-set logs (relational) + the strength sidecar
    // (roll-up blob + session RPE). Best-effort; a logging failure must not
    // block completing the session.
    if (setRows.length > 0) {
      const { error: logErr } = await supabase
        .from('strength_set_logs')
        .insert(setRows.map((r) => ({ ...r, activity_id: act.id })));
      if (logErr) console.error('[workout-preview] failed to insert set logs', logErr);
    }
    if (detailsRow) {
      const { error: detErr } = await supabase
        .from('strength_details')
        .insert({ ...detailsRow, activity_id: act.id });
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

    deleteWorkoutDraft(session.user.id).catch(() => {});
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
  // Card 261. With the gym default gone, an unset user reaching a strength
  // session has no variant to build from: `recoverProgrammeStructure` returns
  // null rather than guessing, and the generic generator's pool still leans on
  // gym machines. So ask, here, at the moment the answer changes what is on
  // screen. Same question and wording as the enrolment screen, one component.
  const workoutPreference = useProfileStore((st) => st.workoutPreference);
  const profileLoaded     = useProfileStore((st) => st.isLoaded);
  const saveProfile       = useProfileStore((st) => st.save);
  const needsEquipment    = modality === 'strength' && profileLoaded && !hasEquipmentPreference(workoutPreference);
  const allLogExercises = useMemo(
    () => strengthStructure ? toLogExercises(strengthStructure) : [],
    [strengthStructure],
  );

  // Why today qualifies, or null. Shown to the user, never just acted on.
  const asideReason = useMemo(
    () => setAsideReason(cycleInfo?.phase ?? null, cycleInfo?.dayOfCycle ?? null, checkin),
    [cycleInfo?.phase, cycleInfo?.dayOfCycle, checkin],
  );

  // Set aside, not removed. The sets are still seeded and still logged if she
  // puts one back, so reactivating costs nothing and loses nothing.
  const setAsideExercises = useMemo(
    () => (asideReason
      ? allLogExercises.filter((ex) => ex.sensitive && !reactivated.has(ex.id))
      : []),
    [asideReason, allLogExercises, reactivated],
  );

  const logExercises = useMemo(
    () => allLogExercises.filter((ex) => !setAsideExercises.some((a) => a.id === ex.id)),
    [allLogExercises, setAsideExercises],
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

      {/* Card 258. Above the state branches deliberately: the preview and the
          live workout both need to say where this session came from, and a
          load failure has to be visible in whichever state we land in. */}
      {loadError && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <InlineError
            title={loadError.title}
            message={loadError.message}
            onDismiss={() => setLoadError(null)}
          />
        </View>
      )}
      {loadedFromCache && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <VirraCard style={{ gap: spacing.xs }}>
            <VirraText variant="mono" size={10} color={colors.dawn} style={{ letterSpacing: 1.5 }}>OFFLINE</VirraText>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={{ lineHeight: 20 }}>
              Loaded from this phone. You can train and finish as normal, and it will sync when you have signal again.
            </VirraText>
          </VirraCard>
        </View>
      )}

      {state === 'loading' && (
        <View style={s.centred}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}

      {/* Asked before anything is drawn, because the answer decides what would
          be drawn. Reloads the session once saved, so the authored variant can
          be recovered rather than the generic pool. */}
      {needsEquipment && state !== 'loading' && (
        <ScrollView contentContainerStyle={s.scroll}>
          <EquipmentChooser
            intro="This session comes in three versions. Pick the one that matches your kit and we will use it from here on. You can change it in your profile at any time."
            onPick={async (value) => {
              if (!session) return;
              await saveProfile(session.user.id, { workoutPreference: value });
              setReloadKey((k) => k + 1);
            }}
          />
        </ScrollView>
      )}

      {!needsEquipment && state === 'idle' && (
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


          {asideReason && (
            <SetAsideGroup
              exercises={setAsideExercises}
              reason={asideReason}
              onRestore={restoreSetAside}
            />
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
                void scheduleRestComplete(restCompleteBody(restarted.exerciseName, 1, null), restarted.endsAt);
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
            {asideReason && (
              <SetAsideGroup
                exercises={setAsideExercises}
                reason={asideReason}
                onRestore={restoreSetAside}
              />
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
      <VirraModal visible={rpeOpen} onClose={() => { if (!saving) { setRpeOpen(false); setRpeError(null); } }} title="How hard was that?">
        {rpeError && (
          <InlineError title={rpeError.title} message={rpeError.message} onDismiss={() => setRpeError(null)} />
        )}
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
  asideRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  asideBtn:  { borderWidth: 1, borderColor: colors.control, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
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
