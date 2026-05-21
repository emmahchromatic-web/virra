import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getDailyStats } from '@/lib/healthKitDaily';
import { ActivityRings } from '@/components/ui/ActivityRing';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { useCycleStore, type CyclePhase, type CycleProfile } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import type { TrainingLoad } from '@/lib/nutritionTargets';
import { WeekStrip } from '@/components/ui/WeekStrip';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { PHASE_META } from '@/lib/phaseMeta';
import { supabase } from '@/lib/supabase';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';

function GuidanceCard({ title, body, accentColor, loading }: {
  title: string; body: string; accentColor: string; loading?: boolean;
}) {
  return (
    <VirraCard style={guide.card}>
      <SectionLabel color={accentColor} style={guide.label}>{title}</SectionLabel>
      {loading ? (
        <View style={guide.skeleton} />
      ) : (
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={guide.body}>{body}</VirraText>
      )}
    </VirraCard>
  );
}

const guide = StyleSheet.create({
  card:     { gap: spacing.xs },
  label:    { letterSpacing: 1.5 },
  body:     { lineHeight: 21, marginTop: spacing.xs },
  skeleton: { height: 42, borderRadius: 4, backgroundColor: colors.border },
});

function EmptyState({ cycleProfile }: { cycleProfile: CycleProfile }) {
  const showCycleHint = cycleProfile === 'natural' || cycleProfile === 'irregular';
  return (
    <VirraCard style={styles.emptyCard}>
      <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
        {showCycleHint
          ? 'Add your cycle data to unlock phase-aware training and nutrition guidance.'
          : 'Training and nutrition targets are personalised to your training load.'}
      </VirraText>
      {showCycleHint && (
        <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.sm, letterSpacing: 1.5 }}>
          GO TO PROFILE → CYCLE SETTINGS
        </VirraText>
      )}
    </VirraCard>
  );
}

const EXERCISE_MINS_TARGET: Record<TrainingLoad, number> = {
  rest:     15,
  easy:     30,
  moderate: 45,
  hard:     60,
};

export default function DashboardScreen() {
  const { cycleInfo, cycleProfile } = useCycleStore();
  const { session } = useAuthStore();
  const { stepsTarget } = useProfileStore();
  const trackWeight       = useProfileStore((s) => s.trackWeight);
  const weightDataVersion = useProfileStore((s) => s.weightDataVersion);
  const meta = cycleInfo ? PHASE_META[cycleInfo.phase] : null;

  const appState        = useRef<AppStateStatus>(AppState.currentState);
  const [steps,        setSteps]        = useState(0);
  const [exerciseMins, setExerciseMins] = useState(0);
  const [inferredLoad, setInferredLoad] = useState<TrainingLoad>('easy');
  const [insightTexts,   setInsightTexts]   = useState<{ training: string; nutrition: string } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [latestKg,       setLatestKg]       = useState<number | null>(null);

  useEffect(() => {
    if (!session || !trackWeight) { setLatestKg(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('body_weights')
        .select('weight_kg')
        .eq('user_id', session.user.id)
        .order('recorded_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setLatestKg(data?.weight_kg ?? null);
    })();
    return () => { cancelled = true; };
  }, [session?.user.id, trackWeight, weightDataVersion]);

  const loadInsight = useCallback(async () => {
    if (!session || !cycleInfo) return;
    setInsightLoading(true);
    try {
      const { data: cached } = await supabase
        .from('insights_cache')
        .select('training_text, nutrition_text, expires_at, phase')
        .eq('user_id', session.user.id)
        .eq('insight_type', 'dashboard')
        .maybeSingle();

      if (cached && new Date(cached.expires_at) > new Date() && cached.phase === cycleInfo.phase) {
        setInsightTexts({ training: cached.training_text, nutrition: cached.nutrition_text });
        setInsightLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: {
          insight_type:  'dashboard',
          phase:         cycleInfo.phase,
          day_of_cycle:  cycleInfo.dayOfCycle,
        },
      });
      if (!error && data?.training_text && data?.nutrition_text) {
        setInsightTexts({ training: data.training_text, nutrition: data.nutrition_text });
      }
    } catch {
      // Silently fall back to PHASE_META
    } finally {
      setInsightLoading(false);
    }
  }, [session, cycleInfo]);

  useEffect(() => {
    function loadAll() {
      getDailyStats().then(({ steps, exerciseMins }) => {
        setSteps(steps);
        setExerciseMins(exerciseMins);
      });
      if (session) {
        const today = new Date().toISOString().split('T')[0];
        getDailyTrainingContext(session.user.id, today, cycleInfo?.phase ?? null)
          .then((ctx) => setInferredLoad(ctx.inferred_load))
          .catch(() => {});
      }
      loadInsight();
    }

    loadAll();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadAll();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [loadInsight]);

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="VIRRA" showProfile />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!cycleInfo || !meta ? (
          <EmptyState cycleProfile={cycleProfile} />
        ) : (
          <>
            <View style={styles.phasePill}>
              <VirraText variant="mono" size={10} color={meta.color} style={styles.pillText}>
                {meta.label.toUpperCase()} PHASE
              </VirraText>
            </View>

            <View style={styles.heroRow}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => router.push('/(app)/cycle-detail' as any)}
              accessibilityRole="button"
              accessibilityLabel="Open cycle detail"
            >
            <VirraCard style={[styles.heroCard, { flex: 1 }]}>
              <VirraText variant="serif" size={22} color={colors.breath} style={styles.tagline}>
                {meta.tagline}
              </VirraText>
              <CycleProgressBar
                dayOfCycle={cycleInfo.dayOfCycle}
                cycleLength={cycleInfo.cycleLength}
                phaseColor={meta.color}
              />
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <VirraText variant="display" size={32} color={meta.color}>{cycleInfo.dayOfCycle}</VirraText>
                  <VirraText variant="mono" size={11} color={colors.muted} style={styles.statLabel}>DAY</VirraText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="display" size={32} color={meta.color}>{cycleInfo.daysUntilNextPeriod}</VirraText>
                  <VirraText variant="mono" size={11} color={colors.muted} style={styles.statLabel}>DAYS LEFT</VirraText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="display" size={32} color={meta.color}>{cycleInfo.cycleLength}</VirraText>
                  <VirraText variant="mono" size={11} color={colors.muted} style={styles.statLabel}>DAY CYCLE</VirraText>
                </View>
              </View>
            </VirraCard>
            </Pressable>
              <VirraCard style={styles.ringsCard}>
                <ActivityRings
                  steps={steps}
                  exerciseMins={exerciseMins}
                  stepsTarget={stepsTarget}
                  exerciseMinsTarget={EXERCISE_MINS_TARGET[inferredLoad]}
                />
              </VirraCard>
            </View>

            {/* Cycle-mode users now see the weight surface inside YOUR CYCLE
                (cycle-detail). Steady-mode users (hormonal, peri/menopause)
                don't have that destination, so they keep the dashboard glance. */}
            {cycleProfile !== 'natural' && cycleProfile !== 'irregular' && (
              <WeightGlanceCard
                latestKg={latestKg}
                onPress={() => router.push('/(app)/weight' as any)}
              />
            )}

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

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionTile, { borderColor: colors.pulse }]}
                onPress={() => router.push('/(app)/insights' as any)}
                accessibilityRole="button"
              >
                <SymbolView name="chart.line.uptrend.xyaxis" size={28} tintColor={colors.pulse} />
                <View>
                  <VirraText variant="mono" size={10} color={colors.pulse} style={styles.actionLabel}>
                    INSIGHTS
                  </VirraText>
                  <VirraText variant="body" size={11} color={colors.muted} style={styles.actionSub}>
                    Your week, narrated
                  </VirraText>
                </View>
              </Pressable>
              <Pressable
                style={[styles.actionTile, { borderColor: colors.dawn }]}
                onPress={() => router.push('/(app)/checkin')}
                accessibilityRole="button"
              >
                <SymbolView name="checkmark.circle" size={28} tintColor={colors.dawn} />
                <View>
                  <VirraText variant="mono" size={10} color={colors.dawn} style={styles.actionLabel}>
                    CHECK IN
                  </VirraText>
                  <VirraText variant="body" size={11} color={colors.muted} style={styles.actionSub}>
                    30 seconds
                  </VirraText>
                </View>
              </Pressable>
            </View>

            <GuidanceCard
              title="Training"
              body={insightTexts?.training ?? meta.training}
              accentColor={meta.color}
              loading={insightLoading && !insightTexts}
            />
            <GuidanceCard
              title="Nutrition"
              body={insightTexts?.nutrition ?? meta.nutrition}
              accentColor={meta.color}
              loading={insightLoading && !insightTexts}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  scroll:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  phasePill:   { flexDirection: 'row' },
  pillText:    { letterSpacing: 2 },
  heroRow:     { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  heroCard:    { gap: 0 },
  tagline:     { lineHeight: 30 },
  statsRow:    { flexDirection: 'row', marginTop: spacing.lg },
  stat:        { flex: 1, alignItems: 'center', gap: 4 },
  statLabel:   { letterSpacing: 1, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  ringsCard:   { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  emptyCard:   { gap: spacing.sm },
  actionRow:   { flexDirection: 'row', gap: spacing.md },
  actionTile:  {
    flex:            1,
    borderWidth:     1.5,
    borderRadius:    radius.md,
    backgroundColor: colors.mist,
    padding:         spacing.md,
    gap:             spacing.sm,
  },
  actionLabel: { letterSpacing: 1.5 },
  actionSub:   { lineHeight: 14, marginTop: 2 },
});
