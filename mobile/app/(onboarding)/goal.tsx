// mobile/app/(onboarding)/goal.tsx
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding, type RunningGoal } from '@/context/OnboardingContext';
import { fetchHKGoalData } from '@/lib/healthKitOnboarding';

const GOAL_OPTIONS: { value: RunningGoal; label: string; sub: string }[] = [
  { value: '5k',       label: '5K',             sub: 'Build your base' },
  { value: '10k',      label: '10K',            sub: 'Push your limits' },
  { value: 'half_marathon', label: 'Half Marathon',  sub: 'Go the distance' },
  { value: 'marathon', label: 'Marathon',       sub: 'The ultimate goal' },
  { value: 'general',  label: 'General Fitness', sub: 'Stay healthy, stay strong' },
];

function deriveGoal(hk: Awaited<ReturnType<typeof fetchHKGoalData>>): RunningGoal | null {
  if (hk.bestMarathonSeconds) return 'marathon';
  if (hk.bestHalfSeconds)     return 'half_marathon';
  if (hk.best10kSeconds)      return '10k';
  if (hk.best5kSeconds)       return '5k';
  return null;
}

export default function GoalScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(5); }, [setStep]));

  const [goal, setGoal]               = useState<RunningGoal | null>(null);
  const [hkSuggested, setHkSuggested] = useState(false);

  useEffect(() => {
    fetchHKGoalData().then((hk) => {
      const derived = deriveGoal(hk);
      if (derived) { setGoal(derived); setHkSuggested(true); }
    });
  }, []);

  function handleContinue() {
    if (!goal) return;
    setData({ runningGoal: goal });
    router.push('/(onboarding)/cycle');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        What are you training for?
      </VirraText>
      {hkSuggested && (
        <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)" style={styles.badge}>
          Based on your best times
        </VirraText>
      )}
      <View style={styles.list}>
        {GOAL_OPTIONS.map((opt) => (
          <Pressable key={opt.value} onPress={() => setGoal(opt.value)}>
            <VirraCard accent={goal === opt.value}>
              <VirraText variant="bodyMedium" color={colors.breath}>{opt.label}</VirraText>
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)">{opt.sub}</VirraText>
            </VirraCard>
          </Pressable>
        ))}
      </View>
      <VirraButton label="CONTINUE" onPress={handleContinue} disabled={!goal} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title:     { lineHeight: 34 },
  badge:     { letterSpacing: 1.5, marginTop: -spacing.sm },
  list:      { gap: spacing.sm },
  cta:       { marginTop: spacing.sm },
});
