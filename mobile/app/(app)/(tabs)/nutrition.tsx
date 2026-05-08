import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { getNutritionTargets, LOAD_LABELS, type TrainingLoad } from '@/lib/nutritionTargets';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

interface FoodEntry {
  id:         string;
  meal_type:  MealType;
  food_name:  string;
  calories:   number;
  carbs_g:    number;
  protein_g:  number;
  fat_g:      number;
}

function MacroBar({ label, actual, target, color }: {
  label:  string;
  actual: number;
  target: number;
  color:  string;
}) {
  const pct = Math.min(actual / target, 1);
  return (
    <View style={macro.row}>
      <VirraText variant="mono" size={9} color={colors.muted} style={macro.label}>{label}</VirraText>
      <View style={macro.track}>
        <View style={[macro.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <VirraText variant="mono" size={9} color={colors.muted} style={macro.value}>
        {Math.round(actual)}/{target}g
      </VirraText>
    </View>
  );
}

const macro = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { width: 52, letterSpacing: 1 },
  track: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: radius.full },
  value: { width: 72, textAlign: 'right', letterSpacing: 0.5 },
});

const NUTRITION_WHY: Record<string, string> = {
  menstrual:  'Iron and magnesium losses during menstruation elevate protein and fat needs. Carb targets are moderate — your body is prioritising repair over performance.',
  follicular: 'Estrogen improves carbohydrate storage efficiency. Higher carb targets here fuel the harder sessions your body is primed to handle.',
  ovulatory:  'Peak metabolic demand. High carbs replenish glycogen rapidly and support the intensity your muscles can output right now.',
  luteal:     'Progesterone increases carb cravings for real physiological reasons — your body is burning slightly more at rest. Higher carb targets support mood, sleep, and preventing energy crashes.',
};

function WhyCard({ body }: { body: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={why.wrap} accessibilityRole="button">
      <View style={why.row}>
        <VirraText variant="mono" size={9} color="rgba(244,237,224,0.35)" style={why.label}>
          WHY?
        </VirraText>
        <SymbolView
          name={open ? 'chevron.up' : 'chevron.down'}
          size={10}
          tintColor="rgba(244,237,224,0.35)"
        />
      </View>
      {open && (
        <VirraText variant="body" size={13} color="rgba(244,237,224,0.55)" style={why.body}>
          {body}
        </VirraText>
      )}
    </Pressable>
  );
}

const why = StyleSheet.create({
  wrap:  { paddingTop: spacing.xs },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { letterSpacing: 1.5 },
  body:  { lineHeight: 20, marginTop: spacing.xs },
});

export default function NutritionScreen() {
  const { session } = useAuthStore();
  const { cycleInfo } = useCycleStore();

  const [load,    setLoad]    = useState<TrainingLoad>('easy');
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [logId,   setLogId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today   = new Date().toISOString().split('T')[0];
  const targets = getNutritionTargets(cycleInfo?.phase ?? null, load);

  const totals = entries.reduce(
    (acc, e) => ({
      calories:  acc.calories  + (e.calories  ?? 0),
      carbs_g:   acc.carbs_g   + (e.carbs_g   ?? 0),
      protein_g: acc.protein_g + (e.protein_g ?? 0),
      fat_g:     acc.fat_g     + (e.fat_g     ?? 0),
    }),
    { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 },
  );

  useEffect(() => {
    if (!session) return;
    loadLog();
  }, [session, today]);

  useFocusEffect(useCallback(() => {
    if (session && logId) {
      supabase
        .from('food_entries')
        .select('id, meal_type, food_name, calories, carbs_g, protein_g, fat_g')
        .eq('log_id', logId)
        .then(({ data }) => setEntries((data as FoodEntry[]) ?? []));
    }
  }, [logId]));

  async function loadLog() {
    if (!session) return;
    setLoading(true);

    // Upsert today's log, storing the current training load
    const { data: log } = await supabase
      .from('nutrition_logs')
      .upsert({
        user_id:      session.user.id,
        recorded_on:  today,
        phase_at_time: cycleInfo?.phase ?? null,
        training_load: load,
        targets_json:  targets ?? {},
      }, { onConflict: 'user_id,recorded_on' })
      .select('id')
      .single();

    if (log) {
      setLogId(log.id);
      const { data: food } = await supabase
        .from('food_entries')
        .select('id, meal_type, food_name, calories, carbs_g, protein_g, fat_g')
        .eq('log_id', log.id);
      setEntries((food as FoodEntry[]) ?? []);
    }
    setLoading(false);
  }

  const byMeal = (meal: MealType) => entries.filter((e) => e.meal_type === meal);

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Nutrition" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Training load selector */}
        <View style={styles.loadRow}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.loadLabel}>
            TODAY'S LOAD
          </VirraText>
          <View style={styles.loadChips}>
            {(Object.keys(LOAD_LABELS) as TrainingLoad[]).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLoad(l)}
                style={[styles.loadChip, load === l && styles.loadActive]}
              >
                <VirraText variant="mono" size={10} color={load === l ? colors.mile : 'rgba(244,237,224,0.6)'}>
                  {LOAD_LABELS[l].toUpperCase()}
                </VirraText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Targets + progress */}
        <VirraCard style={styles.targetsCard}>
          <View style={styles.calRow}>
            <View>
              <VirraText variant="display" size={36} color={colors.pulse}>
                {Math.round(totals.calories)}
              </VirraText>
              <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
                OF {targets.calories} KCAL
              </VirraText>
            </View>
          </View>
          <View style={styles.macros}>
            <MacroBar label="CARBS"   actual={totals.carbs_g}   target={targets.carbs_g}   color={colors.pulse} />
            <MacroBar label="PROTEIN" actual={totals.protein_g} target={targets.protein_g} color={colors.dawn}  />
            <MacroBar label="FAT"     actual={totals.fat_g}     target={targets.fat_g}     color={colors.heat}  />
          </View>
          {cycleInfo && <WhyCard body={NUTRITION_WHY[cycleInfo.phase]} />}
        </VirraCard>

        {/* Meal sections */}
        {MEAL_TYPES.map((meal) => (
          <View key={meal} style={styles.mealSection}>
            <View style={styles.mealHeader}>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.mealLabel}>
                {meal.toUpperCase()}
              </VirraText>
              <Pressable
                onPress={() => logId && router.push(`/(app)/food-search?logId=${logId}&mealType=${meal}` as any)}
                hitSlop={8}
                disabled={!logId}
              >
                <SymbolView name="plus" size={16} tintColor={colors.pulse} />
              </Pressable>
            </View>
            {byMeal(meal).length === 0 ? (
              <VirraText variant="body" size={13} color={colors.muted} style={{ paddingVertical: spacing.xs }}>
                Nothing logged yet
              </VirraText>
            ) : (
              byMeal(meal).map((e) => (
                <View key={e.id} style={styles.entryRow}>
                  <VirraText variant="body" size={14} color={colors.breath} style={{ flex: 1 }}>
                    {e.food_name}
                  </VirraText>
                  <VirraText variant="mono" size={12} color={colors.muted}>
                    {Math.round(e.calories)} kcal
                  </VirraText>
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  scroll:       { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  loadRow:      { gap: spacing.sm },
  loadLabel:    { letterSpacing: 1.5 },
  loadChips:    { flexDirection: 'row', gap: spacing.sm },
  loadChip:     { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  loadActive:   { backgroundColor: colors.pulse, borderColor: colors.pulse },
  targetsCard:  { gap: spacing.md },
  calRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  macros:       { gap: spacing.sm },
  mealSection:  { gap: spacing.sm },
  mealHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealLabel:    { letterSpacing: 1.5 },
  entryRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
});
