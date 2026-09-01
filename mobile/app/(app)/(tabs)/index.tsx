import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView,
  Pressable, AppState, AppStateStatus,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { useCycleStore } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import { useProfileStore, personalMetricsFields } from '@/store/profile';
import { WeekStrip } from '@/components/ui/WeekStrip'
import { ReadinessRow } from '@/components/ui/ReadinessRow';
import { useReadinessStore } from '@/store/readiness';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { ActivityRings } from '@/components/ui/ActivityRing';
import { TodaysSessionHero } from '@/components/ui/TodaysSessionHero';
import { NutritionArcCard } from '@/components/ui/NutritionArcCard';
import { QuickLogRow } from '@/components/ui/QuickLogRow';
import { TipsCarousel } from '@/components/ui/TipsCarousel';
import { FitnessUpdateCard } from '@/components/ui/FitnessUpdateCard';
import { FitnessUpdateModal } from '@/components/ui/FitnessUpdateModal';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { useFitnessUpdate } from '@/hooks/useFitnessUpdate';
import { SymbolView } from 'expo-symbols';
import { PHASE_META } from '@/lib/phaseMeta';
import { getDailyStats } from '@/lib/healthKitDaily';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import { getTodaysSessions } from '@/lib/todaysSession';
import { useTodayStore } from '@/store/today';
import {
  getMonthlyStats, getTodayNutritionTotals, getTodayCheckin,
  type MonthlyStats, type NutritionTotals, type TodayCheckin,
} from '@/lib/dashboardData';
import { buildNarrative } from '@/lib/phaseNarrative';
import { buildPersonalMetrics } from '@/lib/nutritionTargets';
import { getOrCreateTodayLogId, defaultMealSlot } from '@/lib/nutritionLog';
import { appAlert } from '@/components/ui/VirraAlert';
import type { TrainingLoad } from '@/lib/nutritionTargets';
import type { TodaysSession } from '@/lib/todaysSession';
import { tracksCycle } from '@/lib/cycleEngine';

const EXERCISE_MINS_TARGET: Record<TrainingLoad, number> = {
  rest: 15, easy: 30, moderate: 45, hard: 60,
};

export default function DashboardScreen() {
  const { cycleInfo, cycleProfile, isLoading: cycleLoading } = useCycleStore();
  const { session }                 = useAuthStore();
  const trackWeight                 = useProfileStore((s) => s.trackWeight);
  const stepsTarget                 = useProfileStore((s) => s.stepsTarget);
  const { verdict, confirm, snooze } = useFitnessUpdate(session?.user.id ?? null);
  const refreshReadiness = useReadinessStore((s) => s.refresh);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const meta     = cycleInfo ? PHASE_META[cycleInfo.phase] : null;
  const today    = new Date().toLocaleDateString('en-CA');

  const [steps,         setSteps]         = useState(0);
  const [exerciseMins,  setExerciseMins]  = useState(0);
  const [inferredLoad,  setInferredLoad]  = useState<TrainingLoad>('easy');
  const [todaySessions, setTodaySessions] = useState<TodaysSession[]>([]);
  const [monthlyStats,  setMonthlyStats]  = useState<MonthlyStats>({ sessionsCompleted: 0, adherencePct: 0 });
  const [nutrition,     setNutrition]     = useState<NutritionTotals | null>(null);
  const [checkin,       setCheckin]       = useState<TodayCheckin>({ done: false, energy: null, mood: null, sleep: null });
  const [showFitnessModal, setShowFitnessModal] = useState(false);
  const [weightModalOpen,  setWeightModalOpen]  = useState(false);

  const setStoreSessions = useTodayStore((s) => s.setTodaySessions);

  const loadAll = useCallback(async () => {
    if (!session) return;

    getDailyStats().then(({ steps: s, exerciseMins: e }) => {
      setSteps(s);
      setExerciseMins(e);
    });

    // Capture freshly-fetched load into a local const; do NOT read inferredLoad state here
    let resolvedLoad: TrainingLoad = 'easy';
    try {
      const ctx = await getDailyTrainingContext(session.user.id, today, cycleInfo?.phase ?? null);
      resolvedLoad = ctx.inferred_load;
      setInferredLoad(ctx.inferred_load);
    } catch { /* keep default */ }

    try {
      const sessions = await getTodaysSessions(session.user.id);
      setTodaySessions(sessions);
      setStoreSessions(sessions);
    } catch { /* no-op */ }

    try {
      const metrics = buildPersonalMetrics(personalMetricsFields(useProfileStore.getState()));
      const [monthly, nutr, ci] = await Promise.all([
        getMonthlyStats(session.user.id, today),
        getTodayNutritionTotals(session.user.id, today, cycleInfo?.phase ?? null, resolvedLoad, metrics),
        getTodayCheckin(session.user.id, today),
      ]);
      setMonthlyStats(monthly);
      setNutrition(nutr);
      setCheckin(ci);
      // Readiness refresh runs after check-in resolves so it can include today's subjective score
      refreshReadiness(cycleInfo?.phase ?? null, ci).catch(() => {});
    } catch { /* no-op */ }
  }, [session, today, cycleInfo?.phase]); // inferredLoad removed from deps

  // The dashboard is a tab, so it stays mounted while a workout is logged on a
  // pushed screen. Without a refetch on focus, returning from a finished session
  // showed stale cards until the app was backgrounded and reopened.
  useFocusEffect(
    useCallback(() => { loadAll(); }, [loadAll]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') loadAll();
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadAll]);

  // Quick-log food from the dashboard. food-search needs a nutrition_logs row
  // to attach entries to; unlike the Nutrition tab, the home screen has no log
  // loaded, so create/resolve today's row first, then navigate. Without this
  // the add-food handlers silently no-op (no logId → nothing is inserted).
  async function handleFoodQuickLog() {
    if (!session) return;
    const metrics = buildPersonalMetrics(personalMetricsFields(useProfileStore.getState()));
    const logId = await getOrCreateTodayLogId({
      userId:       session.user.id,
      today,
      phase:        cycleInfo?.phase ?? null,
      load:         inferredLoad,
      metrics,
      inferredLoad,
    });
    if (!logId) { appAlert('Could not open food log', 'Please check your connection and try again.'); return; }
    router.push(`/(app)/food-search?logId=${logId}&mealType=${defaultMealSlot()}` as any);
  }

  const narrative = buildNarrative(
    cycleInfo?.phase ?? null,
    cycleInfo?.dayOfCycle ?? null,
    todaySessions,
    inferredLoad,
  );

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="VIRRA" showProfile />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 1. Narrative */}
        {narrative && (
          <VirraText variant="serif" size={13} color="rgba(244,237,224,0.65)" style={styles.narrative}>
            {narrative}
          </VirraText>
        )}

        {/* 2. Phase hero: inline fallback while cycle data loads or isn't set */}
        {cycleInfo && meta ? (
          <Pressable onPress={() => router.push('/(app)/cycle-detail' as any)} accessibilityRole="button">
            <VirraCard style={styles.phaseCard}>
              <VirraText variant="mono" size={9} color={meta.color} style={styles.phasePill}>
                {meta.label.toUpperCase()} PHASE
              </VirraText>
              <VirraText variant="serif" size={15} color={colors.breath} style={styles.tagline}>
                {meta.tagline}
              </VirraText>
              <CycleProgressBar
                dayOfCycle={cycleInfo.dayOfCycle}
                cycleLength={cycleInfo.cycleLength}
                phaseColor={meta.color}
              />
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <VirraText variant="display" size={28} color={meta.color}>{cycleInfo.dayOfCycle}</VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAY</VirraText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="display" size={28} color={meta.color}>{cycleInfo.daysUntilNextPeriod}</VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAYS LEFT</VirraText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="display" size={28} color={meta.color}>{cycleInfo.cycleLength}</VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAY CYCLE</VirraText>
                </View>
              </View>
              {monthlyStats.sessionsCompleted > 0 && (
                <View style={styles.streakRow}>
                  <View style={styles.streakLeft}>
                    <VirraText variant="display" size={20} color={colors.dawn}>
                      {monthlyStats.sessionsCompleted}
                    </VirraText>
                    <VirraText variant="mono" size={8} color={colors.muted} style={styles.streakMeta}>
                      sessions this month
                    </VirraText>
                  </View>
                  <VirraText variant="mono" size={9} color={colors.dawn}>
                    {monthlyStats.adherencePct}% ON PLAN
                  </VirraText>
                </View>
              )}
            </VirraCard>
          </Pressable>
        ) : !cycleLoading && (
          <Pressable onPress={() => router.push('/(app)/cycle-settings' as any)} accessibilityRole="button">
            <VirraCard style={styles.phaseCard}>
              <VirraText variant="mono" size={9} color={colors.pulse} style={styles.phasePill}>
                CYCLE PHASE
              </VirraText>
              <VirraText variant="serif" size={15} color={colors.breath} style={styles.tagline}>
                {tracksCycle(cycleProfile)
                  ? 'Add your cycle data to unlock phase-aware guidance.'
                  : 'Your training and nutrition targets are personalised to your load.'}
              </VirraText>
              {tracksCycle(cycleProfile) && (
                <VirraText variant="mono" size={10} color={colors.pulse} style={{ letterSpacing: 1.5, marginTop: spacing.xs }}>
                  SET UP CYCLE →
                </VirraText>
              )}
            </VirraCard>
          </Pressable>
        )}

        {/* 3. Readiness */}
        <ReadinessRow />

        {/* 4. Today session + rings */}
        <View style={styles.heroRow}>
          <TodaysSessionHero
            sessions={todaySessions}
            onStartPress={(session) => {
              if (session.modality === 'run') {
                router.push(`/(app)/run?sessionId=${session.id}` as any);
              } else {
                router.push(`/(app)/workout-preview?sessionId=${session.id}` as any);
              }
            }}
            style={styles.sessionHero}
          />
          <VirraCard style={styles.ringsCard}>
            <ActivityRings
              steps={steps}
              exerciseMins={exerciseMins}
              stepsTarget={stepsTarget}
              exerciseMinsTarget={EXERCISE_MINS_TARGET[inferredLoad]}
            />
          </VirraCard>
        </View>

        {/* 5. Nutrition arc */}
        {nutrition && (
          <NutritionArcCard
            totals={nutrition}
            onPress={() => router.push('/(app)/(tabs)/nutrition' as any)}
          />
        )}

        {/* 6. Quick log */}
        <QuickLogRow
          trackWeight={trackWeight}
          onFoodPress={handleFoodQuickLog}
          onActivityPress={() => router.push('/(app)/manual-activity' as any)}
          onWeightPress={() => setWeightModalOpen(true)}
        />

        {/* 7. Week strip */}
        {session && (
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/training' as any)}
            accessibilityRole="button"
            accessibilityLabel="This week's training, open Training tab"
          >
            <VirraCard style={{ paddingVertical: spacing.xs }}>
              <SectionLabel style={{ marginBottom: 2 }}>THIS WEEK</SectionLabel>
              <WeekStrip userId={session.user.id} phase={cycleInfo?.phase ?? null} />
            </VirraCard>
          </Pressable>
        )}

        {/* 8. Phase tips */}
        <TipsCarousel phase={cycleInfo?.phase ?? null} />

        {/* 9. Fitness update card (conditional) */}
        {verdict && (
          <FitnessUpdateCard
            verdict={verdict}
            onOpen={() => setShowFitnessModal(true)}
            onDismiss={snooze}
          />
        )}

        {/* 10. Action tiles */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionTile, { borderColor: colors.pulse }]}
            onPress={() => router.push('/(app)/insights' as any)}
            accessibilityRole="button"
          >
            <SymbolView name="chart.line.uptrend.xyaxis" size={28} tintColor={colors.pulse} />
            <View>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.actionLabel}>INSIGHTS</VirraText>
              <VirraText variant="body" size={11} color={colors.muted} style={styles.actionSub}>Your week, narrated</VirraText>
            </View>
          </Pressable>

          {checkin.done ? (
            <Pressable
              style={[styles.actionTile, { borderColor: colors.pulse, backgroundColor: 'rgba(212,255,38,0.06)' }]}
              onPress={() => router.push('/(app)/checkin-trends' as any)}
              accessibilityRole="button"
            >
              <SymbolView name="checkmark.circle.fill" size={28} tintColor={colors.pulse} />
              <View style={{ flex: 1 }}>
                <VirraText variant="mono" size={10} color={colors.pulse} style={styles.actionLabel}>CHECKED IN</VirraText>
                <View style={styles.checkinVals}>
                  {[
                    { label: 'ENERGY', val: checkin.energy },
                    { label: 'MOOD',   val: checkin.mood   },
                    { label: 'SLEEP',  val: checkin.sleep  },
                  ].map(({ label, val }) => val !== null && (
                    <View key={label} style={styles.checkinVal}>
                      <VirraText variant="display" size={14} color={colors.pulse}>{val}</VirraText>
                      <VirraText variant="mono" size={6} color="rgba(212,255,38,0.5)">{label}</VirraText>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionTile, { borderColor: colors.dawn }]}
              onPress={() => router.push('/(app)/checkin')}
              accessibilityRole="button"
            >
              <SymbolView name="checkmark.circle" size={28} tintColor={colors.dawn} />
              <View>
                <VirraText variant="mono" size={10} color={colors.dawn} style={styles.actionLabel}>CHECK IN</VirraText>
                <VirraText variant="body" size={11} color={colors.muted} style={styles.actionSub}>30 seconds</VirraText>
              </View>
            </Pressable>
          )}
        </View>

      </ScrollView>

      <FitnessUpdateModal
        visible={showFitnessModal}
        verdict={verdict}
        onConfirm={async () => { await confirm(); setShowFitnessModal(false); }}
        onSnooze={async () => { await snooze(); setShowFitnessModal(false); }}
      />

      {session && (
        <AddWeightModal
          visible={weightModalOpen}
          userId={session.user.id}
          onClose={() => setWeightModalOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  scroll:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  narrative:   {
    lineHeight:        20,
    paddingBottom:     spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  phaseCard:   { gap: spacing.xs },
  phasePill:   { letterSpacing: 2 },
  tagline:     { lineHeight: 22, marginBottom: spacing.xs },
  statsRow:    { flexDirection: 'row', marginTop: spacing.sm },
  stat:        { flex: 1, alignItems: 'center', gap: 2 },
  statLabel:   { letterSpacing: 1.5, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  streakRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                 marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  streakLeft:  { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  streakMeta:  { letterSpacing: 0.5 },
  heroRow:     { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  sessionHero: { flex: 1 },
  ringsCard:   { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, width: 80 },
  actionRow:   { flexDirection: 'row', gap: spacing.md },
  actionTile:  {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    backgroundColor: colors.mist, padding: spacing.md, gap: spacing.sm,
  },
  actionLabel:  { letterSpacing: 1.5 },
  actionSub:    { lineHeight: 14, marginTop: 2 },
  checkinVals:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs,
                  paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: 'rgba(212,255,38,0.15)' },
  checkinVal:   { alignItems: 'center', gap: 2 },
});
