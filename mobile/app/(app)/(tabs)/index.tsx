import React, { useRef, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { getDailyStats } from '@/lib/healthKitDaily';
import { ActivityRings } from '@/components/ui/ActivityRing';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { useCycleStore, type CyclePhase } from '@/store/cycle';

const PHASE_META: Record<CyclePhase, {
  label:     string;
  tagline:   string;
  training:  string;
  nutrition: string;
  color:     string;
}> = {
  menstrual: {
    label:     'Menstrual',
    tagline:   'Rest, restore, and honour your body.',
    training:  'Easy movement only — yoga, walking, or full rest. No hard efforts.',
    nutrition: 'Iron-rich foods. Warming meals. Honour cravings without guilt.',
    color:     colors.heat,
  },
  follicular: {
    label:     'Follicular',
    tagline:   'Energy is rising. Build on it.',
    training:  'Ramp up intensity. Strength sessions and tempo runs respond well now.',
    nutrition: 'Lean protein and complex carbs to fuel adaptation.',
    color:     colors.dawn,
  },
  ovulatory: {
    label:     'Ovulatory',
    tagline:   'Peak window. Push hard.',
    training:  'Highest-intensity workouts belong here. Your body is primed.',
    nutrition: 'High-carb day. Your muscles are ready to use every gram.',
    color:     colors.pulse,
  },
  luteal: {
    label:     'Luteal',
    tagline:   'Maintain, don\'t overreach.',
    training:  'Moderate effort. Honour fatigue signals — they\'re real.',
    nutrition: 'Carbs curb cravings and support mood. Magnesium helps sleep.',
    color:     colors.breath,
  },
};

function CycleProgressBar({ dayOfCycle, cycleLength, phaseColor }: {
  dayOfCycle: number; cycleLength: number; phaseColor: string;
}) {
  const pct = Math.min((dayOfCycle - 1) / cycleLength, 1);
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${pct * 100}%` as any, backgroundColor: phaseColor }]} />
      <View style={[bar.dot, { left: `${pct * 100}%` as any, backgroundColor: phaseColor }]} />
    </View>
  );
}

const bar = StyleSheet.create({
  track: { height: 3, backgroundColor: colors.border, borderRadius: radius.full, marginTop: spacing.md, position: 'relative', overflow: 'visible' },
  fill:  { position: 'absolute', top: 0, left: 0, height: 3, borderRadius: radius.full },
  dot:   { position: 'absolute', top: -4, width: 11, height: 11, borderRadius: radius.full, marginLeft: -5 },
});

function GuidanceCard({ title, body, accentColor }: { title: string; body: string; accentColor: string }) {
  return (
    <VirraCard style={guide.card}>
      <VirraText variant="mono" size={10} color={accentColor} style={guide.label}>{title.toUpperCase()}</VirraText>
      <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={guide.body}>{body}</VirraText>
    </VirraCard>
  );
}

const guide = StyleSheet.create({
  card:  { gap: spacing.xs },
  label: { letterSpacing: 1.5 },
  body:  { lineHeight: 21, marginTop: spacing.xs },
});

function EmptyState() {
  return (
    <VirraCard style={styles.emptyCard}>
      <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
        Add your cycle data to unlock phase-aware training and nutrition guidance.
      </VirraText>
      <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.sm, letterSpacing: 1.5 }}>
        GO TO PROFILE → CYCLE SETTINGS
      </VirraText>
    </VirraCard>
  );
}

export default function DashboardScreen() {
  const { cycleInfo } = useCycleStore();
  const meta = cycleInfo ? PHASE_META[cycleInfo.phase] : null;

  const appState        = useRef<AppStateStatus>(AppState.currentState);
  const [steps,        setSteps]        = useState(0);
  const [exerciseMins, setExerciseMins] = useState(0);

  useEffect(() => {
    function load() {
      getDailyStats().then(({ steps, exerciseMins }) => {
        setSteps(steps);
        setExerciseMins(exerciseMins);
      });
    }

    load();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        load();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="VIRRA" showProfile />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!cycleInfo || !meta ? (
          <EmptyState />
        ) : (
          <>
            <View style={styles.phasePill}>
              <VirraText variant="mono" size={10} color={meta.color} style={styles.pillText}>
                {meta.label.toUpperCase()} PHASE
              </VirraText>
            </View>

            <View style={styles.heroRow}>
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
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAY</VirraText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="display" size={32} color={meta.color}>{cycleInfo.daysUntilNextPeriod}</VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAYS LEFT</VirraText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <VirraText variant="display" size={32} color={meta.color}>{cycleInfo.cycleLength}</VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAY CYCLE</VirraText>
                </View>
              </View>
            </VirraCard>
              <VirraCard style={styles.ringsCard}>
                <ActivityRings steps={steps} exerciseMins={exerciseMins} />
              </VirraCard>
            </View>

            <GuidanceCard title="Training"  body={meta.training}  accentColor={meta.color} />
            <GuidanceCard title="Nutrition" body={meta.nutrition} accentColor={meta.color} />

            <VirraButton
              label="Check in for today"
              variant="ghost"
              onPress={() => router.push('/(app)/checkin')}
            />
          </>
        )}

        <Pressable
          onPress={() => router.push('/(app)/insights' as any)}
          style={styles.insightLink}
          accessibilityRole="button"
        >
          <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
            VIEW INSIGHTS →
          </VirraText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  scroll:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  phasePill:   { flexDirection: 'row' },
  pillText:    { letterSpacing: 2 },
  heroRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroCard:    { gap: 0 },
  tagline:     { lineHeight: 30 },
  statsRow:    { flexDirection: 'row', marginTop: spacing.lg },
  stat:        { flex: 1, alignItems: 'center', gap: 4 },
  statLabel:   { letterSpacing: 1, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  ringsCard:   { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  emptyCard:   { gap: spacing.sm },
  insightLink: { alignItems: 'center', paddingVertical: spacing.xs },
});
