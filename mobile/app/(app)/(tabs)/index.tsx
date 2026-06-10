import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView,
  Pressable, AppState, AppStateStatus,
} from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { useCycleStore } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import { WeekStrip } from '@/components/ui/WeekStrip';
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
import {
  getMonthlyStats, getTodayNutritionTotals, getTodayCheckin,
  type MonthlyStats, type NutritionTotals, type TodayCheckin,
} from '@/lib/dashboardData';
import { buildNarrative } from '@/lib/phaseNarrative';
import type { TrainingLoad } from '@/lib/nutritionTargets';
import type { TodaysSession } from '@/lib/todaysSession';

const EXERCISE_MINS_TARGET: Record<TrainingLoad, number> = {
  rest: 15, easy: 30, moderate: 45, hard: 60,
};

export default function DashboardScreen() {
  const { cycleInfo, cycleProfile } = useCycleStore();
  const { session }                 = useAuthStore();
  const trackWeight                 = useProfileStore((s) => s.trackWeight);
  const stepsTarget                 = useProfileStore((s) => s.stepsTarget);
  const { verdict, confirm, snooze } = useFitnessUpdate(session?.user.id ?? null);

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

  const loadAll = useCallback(async () => {
    if (!session) return;

    getDailyStats().then(({ steps: s, exerciseMins: e }) => {
      setSteps(s);
      setExerciseMins(e);
    });

    try {
      const ctx = await getDailyTrainingContext(session.user.id, today, cycleInfo?.phase ?? null);
      setInferredLoad(ctx.inferred_load);
    } catch { /* keep previous load */ }

    try {
      const sessions = await getTodaysSessions(session.user.id);
      setTodaySessions(sessions);
    } catch { /* no-op */ }

    try {
      const [monthly, nutr, ci] = await Promise.all([
        getMonthlyStats(session.user.id, today),
        getTodayNutritionTotals(session.user.id, today, cycleInfo?.phase ?? null, inferredLoad),
        getTodayCheckin(session.user.id, today),
      ]);
      setMonthlyStats(monthly);
      setNutrition(nutr);
      setCheckin(ci);
    } catch { /* no-op */ }
  }, [session, today, cycleInfo?.phase, inferredLoad]);

  useEffect(() => {
    loadAll();
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') loadAll();
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadAll]);

  const narrative = buildNarrative(
    cycleInfo?.phase ?? null,
    cycleInfo?.dayOfCycle ?? null,
    todaySessions,
    inferredLoad,
  );

  if (!cycleInfo || !meta) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader title="VIRRA" showProfile />
        <ScrollView contentContainerStyle={styles.scroll}>
          <VirraCard>
            <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
              {cycleProfile === 'natural' || cycleProfile === 'irregular'
                ? 'Add your cycle data to unlock phase-aware training and nutrition guidance.'
                : 'Training and nutrition targets are personalised to your training load.'}
            </VirraText>
            {(cycleProfile === 'natural' || cycleProfile === 'irregular') && (
              <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.sm, letterSpacing: 1.5 }}>
                GO TO PROFILE → CYCLE SETTINGS
              </VirraText>
            )}
          </VirraCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

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

        {/* 2. Phase hero */}
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

        {/* 3. Today session + rings */}
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <TodaysSessionHero
              sessions={todaySessions}
              onStartPress={() => router.push('/(app)/(tabs)/training' as any)}
            />
          </View>
          <VirraCard style={styles.ringsCard}>
            <ActivityRings
              steps={steps}
              exerciseMins={exerciseMins}
              stepsTarget={stepsTarget}
              exerciseMinsTarget={EXERCISE_MINS_TARGET[inferredLoad]}
            />
          </VirraCard>
        </View>

        {/* 4. Nutrition arc */}
        {nutrition && (
          <NutritionArcCard
            totals={nutrition}
            onPress={() => router.push('/(app)/(tabs)/nutrition' as any)}
          />
        )}

        {/* 5. Quick log */}
        <QuickLogRow
          trackWeight={trackWeight}
          onFoodPress={() => router.push('/(app)/food-search' as any)}
          onActivityPress={() => router.push('/(app)/manual-activity' as any)}
          onWeightPress={() => setWeightModalOpen(true)}
        />

        {/* 6. Week strip */}
        {session && (
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/training' as any)}
            accessibilityRole="button"
            accessibilityLabel="This week's training — open Training tab"
          >
            <VirraCard style={{ paddingVertical: spacing.xs }}>
              <SectionLabel style={{ marginBottom: 2 }}>THIS WEEK</SectionLabel>
              <WeekStrip userId={session.user.id} phase={cycleInfo?.phase ?? null} />
            </VirraCard>
          </Pressable>
        )}

        {/* 7. Phase tips */}
        <TipsCarousel phase={cycleInfo?.phase ?? null} />

        {/* 8. Fitness update card (conditional) */}
        {verdict && (
          <FitnessUpdateCard
            verdict={verdict}
            onOpen={() => setShowFitnessModal(true)}
            onDismiss={snooze}
          />
        )}

        {/* 9. Action tiles */}
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
              onPress={() => router.push('/(app)/checkin')}
              accessibilityRole="button"
            >
              <SymbolView name="checkmark.circle.fill" size={28} tintColor={colors.pulse} />
              <View style={{ flex: 1 }}>
                <VirraText variant="mono" size={10} color={colors.pulse} style={styles.actionLabel}>✓ CHECKED IN</VirraText>
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
