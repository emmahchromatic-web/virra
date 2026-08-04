// mobile/app/(onboarding)/fitness.tsx
import React, { useState, useEffect } from 'react';
import { View, TextInput, ScrollView, StyleSheet, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding } from '@/context/OnboardingContext';
import {
  fetchHKFitnessData,
  deriveFitnessLevel,
  deriveWeeklyMileageBracket,
  type FitnessLevel,
  type WeeklyMileageBracket,
} from '@/lib/healthKitOnboarding';

const FITNESS_OPTIONS: { value: FitnessLevel; label: string; sub: string }[] = [
  { value: 'beginner',     label: 'Beginner',     sub: 'Just starting out' },
  { value: 'recreational', label: 'Recreational', sub: 'Running for fun' },
  { value: 'intermediate', label: 'Intermediate', sub: 'Training consistently' },
  { value: 'advanced',     label: 'Advanced',     sub: 'Racing regularly' },
  { value: 'returning',    label: 'Returning',    sub: 'Coming back after a break' },
];

const MILEAGE_OPTIONS: WeeklyMileageBracket[] = ['<5', '5-15', '15-30', '30+'];

export default function FitnessScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(4); }, [setStep]));

  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | null>(null);
  const [mileage, setMileage]           = useState<WeeklyMileageBracket | null>(null);
  const [fiveKTime, setFiveKTime]       = useState('');
  const [hkBadges, setHkBadges]         = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHKFitnessData().then((hk) => {
      const badges = new Set<string>();
      const level   = deriveFitnessLevel(hk.avgPaceSeconds);
      const bracket = deriveWeeklyMileageBracket(hk.weeklyKm);
      if (level)   { setFitnessLevel(level);   badges.add('level'); }
      if (bracket) { setMileage(bracket);       badges.add('mileage'); }
      if (hk.best5kSeconds) {
        const m = Math.floor(hk.best5kSeconds / 60);
        const s = String(hk.best5kSeconds % 60).padStart(2, '0');
        setFiveKTime(`${m}:${s}`);
        badges.add('fivek');
      }
      setHkBadges(badges);
    });
  }, []);

  function handleContinue() {
    if (!fitnessLevel || !mileage) return;
    setData({ fitnessLevel, weeklyMileage: mileage, fiveKTime });
    router.push('/(onboarding)/goal');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Let's build your baseline.
      </VirraText>

      {/* Fitness level */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            FITNESS LEVEL
          </VirraText>
          {hkBadges.has('level') && (
            <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
              {' '}· From Apple Health
            </VirraText>
          )}
        </View>
        <View style={styles.cardGrid}>
          {FITNESS_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setFitnessLevel(opt.value)}
              style={opt.value === 'returning' ? styles.fullCard : styles.halfCard}
            >
              <VirraCard accent={fitnessLevel === opt.value}>
                <VirraText variant="bodyMedium" color={colors.breath}>{opt.label}</VirraText>
                <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)">{opt.sub}</VirraText>
              </VirraCard>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Weekly mileage */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            CURRENT AVE. WEEKLY MILEAGE (KM)
          </VirraText>
          {hkBadges.has('mileage') && (
            <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
              {' '}· From Apple Health
            </VirraText>
          )}
        </View>
        <View style={styles.segmented}>
          {MILEAGE_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setMileage(opt)}
              style={[styles.segment, mileage === opt && styles.segmentActive]}
            >
              <VirraText
                variant="mono"
                size={12}
                color={mileage === opt ? colors.mile : 'rgba(244,237,224,0.6)'}
              >
                {opt}
              </VirraText>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 5K time */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            RECENT 5K TIME
          </VirraText>
          {hkBadges.has('fivek') && (
            <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
              {' '}· From Apple Health
            </VirraText>
          )}
        </View>
        <TextInput
          value={fiveKTime}
          onChangeText={setFiveKTime}
          placeholder="MM:SS"
          placeholderTextColor="rgba(244,237,224,0.25)"
          style={styles.timeInput}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)">
          Leave blank if you haven't raced
        </VirraText>
      </View>

      <VirraButton
        label="CONTINUE"
        onPress={handleContinue}
        disabled={!fitnessLevel || !mileage}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:        { flex: 1 },
  container:     { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:         { lineHeight: 34 },
  section:       { gap: spacing.sm },
  fieldRow:      { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:    { letterSpacing: 2 },
  cardGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  halfCard:      { width: '47%' },
  fullCard:      { width: '100%' },
  segmented:     { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  segment:       { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.mist },
  segmentActive: { backgroundColor: colors.pulse },
  timeInput:     { backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, color: colors.breath, fontFamily: 'SpaceMono_400Regular', fontSize: 18, borderWidth: 1, borderColor: colors.border },
  cta:           { marginTop: spacing.sm },
});
