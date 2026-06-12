import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { getNutritionTargets, LOAD_LABELS, type TrainingLoad } from '@/lib/nutritionTargets';
import { getDailyTrainingContext, type DailyTrainingContext } from '@/lib/dailyTrainingContext';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { FoodEntryEditModal } from '@/components/ui/FoodEntryEditModal';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

interface FoodEntry {
  id:           string;
  meal_type:    MealType;
  food_name:    string;
  calories:     number;
  carbs_g:      number;
  protein_g:    number;
  fat_g:        number;
  fibre_g:      number;
  quantity_g:   number | null;
  source:       'manual' | 'common' | 'off' | 'barcode' | 'haiku';
  haiku_input:  string | null;
  log_id:       string;
}

function MacroBar({ label, actual, target, color, height }: {
  label:   string;
  actual:  number;
  target:  number;
  color:   string;
  height?: number;
}) {
  const trackHeight = height ?? 6;
  const ratio    = target > 0 ? actual / target : 0;
  const over     = ratio > 1.1;
  const basePct  = Math.min(ratio, 1);
  const overPct  = over ? Math.min((ratio - 1) / 0.5, 1) : 0; // overflow segment scales up to 50% over
  return (
    <View style={macro.row}>
      {label ? (
        <VirraText variant="mono" size={11} color={colors.muted} style={macro.label} numberOfLines={1}>{label}</VirraText>
      ) : (
        <View style={macro.label} />
      )}
      <View style={[macro.track, { height: trackHeight }]}>
        <View style={[macro.fill, { width: `${basePct * 100}%` as any, backgroundColor: color }]} />
        {over && (
          <View style={[macro.fill, macro.overflow, { width: `${overPct * 100}%` as any }]} />
        )}
      </View>
      {label ? (
        <VirraText variant="mono" size={11} color={over ? colors.heat : colors.muted} style={macro.value} numberOfLines={1}>
          {Math.round(actual)}/{target}g
        </VirraText>
      ) : (
        <View style={macro.value} />
      )}
    </View>
  );
}

const macro = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { width: 62, letterSpacing: 1 },
  track:    { flex: 1, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  fill:     { height: '100%', borderRadius: radius.full },
  overflow: { backgroundColor: colors.heat, position: 'absolute', right: 0, top: 0, bottom: 0 },
  value: { width: 76, textAlign: 'right', letterSpacing: 0.5 },
});

const NUTRITION_WHY: Record<string, string> = {
  menstrual:  'Iron and magnesium losses during menstruation elevate protein and fat needs. Carb targets are moderate; your body is prioritising repair over performance.',
  follicular: 'Estrogen improves carbohydrate storage efficiency. Higher carb targets here fuel the harder sessions your body is primed to handle.',
  ovulatory:  'Peak metabolic demand. High carbs replenish glycogen rapidly and support the intensity your muscles can output right now.',
  luteal:     'Progesterone increases carb cravings for real physiological reasons; your body is burning slightly more at rest. Higher carb targets support mood, sleep, and preventing energy crashes.',
};

function WhyCard({ body }: { body: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={why.wrap} accessibilityRole="button">
      <View style={why.row}>
        <VirraText variant="mono" size={11} color="rgba(244,237,224,0.35)" style={why.label}>
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

// ---- FoodEntryRow ----

interface FoodEntryRowProps {
  entry:    FoodEntry;
  onEdit:   (entry: FoodEntry) => void;
  onDelete: (entry: FoodEntry) => void;
}

function FoodEntryRow({ entry, onEdit, onDelete }: FoodEntryRowProps) {
  const swipeRef = useRef<Swipeable>(null);

  function handleDelete() {
    swipeRef.current?.close();
    Alert.alert(
      'Delete entry',
      `Delete "${entry.food_name}"?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeRef.current?.close() },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry) },
      ],
    );
  }

  function renderRightActions() {
    return (
      <Pressable style={row.deleteAction} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete food entry">
        <VirraText variant="mono" size={11} color={colors.breath} style={row.deleteLabel}>
          DELETE
        </VirraText>
      </Pressable>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
    >
      <Pressable
        onLongPress={() => onEdit(entry)}
        delayLongPress={400}
        style={({ pressed }) => [styles.entryRow, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${entry.food_name}${entry.source === 'haiku' ? ' (estimated)' : ''}`}
      >
        <View style={row.nameLine}>
          <VirraText variant="body" size={14} color={colors.breath} style={row.name}>
            {entry.food_name}
          </VirraText>
          {entry.source === 'haiku' && (
            <View style={row.estChip}>
              <VirraText variant="mono" size={9} color={colors.breath} style={row.estChipLabel}>EST.</VirraText>
            </View>
          )}
        </View>
        <VirraText variant="mono" size={12} color={colors.muted}>
          {Math.round(entry.calories)} kcal
        </VirraText>
      </Pressable>
    </Swipeable>
  );
}

const row = StyleSheet.create({
  deleteAction: {
    width:           80,
    backgroundColor: colors.heat,
    alignItems:      'center',
    justifyContent:  'center',
  },
  deleteLabel: {
    letterSpacing: 1.5,
  },
  nameLine: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    flexWrap:       'wrap',
  },
  name: {
    flexShrink: 1,
  },
  estChip: {
    backgroundColor:   colors.heat,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
  },
  estChipLabel: {
    letterSpacing: 1.5,
  },
});

// ---- NutritionScreen ----

export default function NutritionScreen() {
  const { session } = useAuthStore();
  const { cycleInfo } = useCycleStore();

  const [load,    setLoad]    = useState<TrainingLoad>('easy');
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [logId,   setLogId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyContext, setDailyContext] = useState<DailyTrainingContext | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const today   = new Date().toISOString().split('T')[0];
  const targets = getNutritionTargets(cycleInfo?.phase ?? null, load);

  const totals = entries.reduce(
    (acc, e) => ({
      calories:  acc.calories  + (e.calories  ?? 0),
      carbs_g:   acc.carbs_g   + (e.carbs_g   ?? 0),
      protein_g: acc.protein_g + (e.protein_g ?? 0),
      fat_g:     acc.fat_g     + (e.fat_g     ?? 0),
      fibre_g:   acc.fibre_g   + (e.fibre_g   ?? 0),
    }),
    { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, fibre_g: 0 },
  );

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session, today]);

  useFocusEffect(useCallback(() => {
    if (session && logId) {
      supabase
        .from('food_entries')
        .select('id, meal_type, food_name, calories, carbs_g, protein_g, fat_g, fibre_g, quantity_g, source, haiku_input, log_id')
        .eq('log_id', logId)
        .then(({ data }) => setEntries((data as FoodEntry[]) ?? []));
    }
  }, [logId]));

  async function loadData() {
    if (!session) return;
    setLoading(true);

    let ctx: DailyTrainingContext | null = null;
    try {
      ctx = await getDailyTrainingContext(
        session.user.id,
        today,
        cycleInfo?.phase ?? null,
      );
      setDailyContext(ctx);
      setLoad(ctx.inferred_load);
    } catch {
      // Network error — fall back to 'easy' default, no label shown
    }

    const effectiveLoad    = ctx?.inferred_load ?? load;
    const effectiveTargets = getNutritionTargets(cycleInfo?.phase ?? null, effectiveLoad);

    const { data: log } = await supabase
      .from('nutrition_logs')
      .upsert({
        user_id:       session.user.id,
        recorded_on:   today,
        phase_at_time: cycleInfo?.phase ?? null,
        training_load: effectiveLoad,
        inferred_load: ctx?.inferred_load ?? null,
        targets_json:  effectiveTargets,
      }, { onConflict: 'user_id,recorded_on' })
      .select('id')
      .single();

    if (log) {
      setLogId(log.id);
      const { data: food } = await supabase
        .from('food_entries')
        .select('id, meal_type, food_name, calories, carbs_g, protein_g, fat_g, fibre_g, quantity_g, source, haiku_input, log_id')
        .eq('log_id', log.id);
      setEntries((food as FoodEntry[]) ?? []);
    }
    setLoading(false);
  }

  const byMeal = (meal: MealType) => entries.filter((e) => e.meal_type === meal);

  async function handleDeleteEntry(entry: FoodEntry) {
    await supabase.from('food_entries').delete().eq('id', entry.id);
    // Optimistically remove from local state for instant feedback
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  function reloadEntries() {
    if (!logId) return;
    supabase
      .from('food_entries')
      .select('id, meal_type, food_name, calories, carbs_g, protein_g, fat_g, fibre_g, quantity_g, source, haiku_input, log_id')
      .eq('log_id', logId)
      .then(({ data }) => setEntries((data as FoodEntry[]) ?? []));
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Nutrition" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Training load selector */}
        <View style={styles.loadRow}>
          <VirraText variant="mono" size={11} color={colors.muted} style={styles.loadLabel}>
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
          {dailyContext && load === dailyContext.inferred_load && (
            <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1 }}>
              {dailyContext.source_label
                ? `AUTO-SET · ${dailyContext.source_label.toUpperCase()}`
                : 'AUTO-SET · REST DAY'}
            </VirraText>
          )}
        </View>

        {/* Targets + progress */}
        <VirraCard style={styles.targetsCard}>
          {/* Full-width calories progress bar at top */}
          {(() => {
            const ratio   = targets.calories > 0 ? totals.calories / targets.calories : 0;
            const over    = ratio > 1.1;
            const basePct = Math.min(ratio, 1);
            const overPct = over ? Math.min((ratio - 1) / 0.5, 1) : 0;
            return (
              <View style={styles.caloriesTrack}>
                <View style={[styles.caloriesFill, { width: `${basePct * 100}%` as any, backgroundColor: colors.pulse }]} />
                {over && (
                  <View style={[styles.caloriesFill, styles.caloriesOverflow, { width: `${overPct * 100}%` as any }]} />
                )}
              </View>
            );
          })()}
          {/* Hero calorie count + target subline */}
          <View>
            <VirraText variant="display" size={36} color={colors.pulse}>
              {Math.round(totals.calories)}
            </VirraText>
            <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>
              OF {targets.calories} KCAL
            </VirraText>
          </View>
          <View style={styles.macros}>
            <MacroBar label="CARBS"   actual={totals.carbs_g}   target={targets.carbs_g}   color={colors.dawn}   />
            <MacroBar label="PROTEIN" actual={totals.protein_g} target={targets.protein_g} color={colors.heat}   />
            <MacroBar label="FAT"     actual={totals.fat_g}     target={targets.fat_g}     color={colors.breath} />
            <MacroBar label="FIBRE"   actual={totals.fibre_g}   target={targets.fibre_g}   color={colors.muted}  />
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
                <FoodEntryRow
                  key={e.id}
                  entry={e}
                  onEdit={setEditing}
                  onDelete={handleDeleteEntry}
                />
              ))
            )}
          </View>
        ))}
      </ScrollView>

      <FoodEntryEditModal
        visible={editing !== null}
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={reloadEntries}
      />
    </SafeAreaView>
    </GestureHandlerRootView>
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
  targetsCard:        { gap: spacing.md },
  caloriesTrack:      { height: 10, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  caloriesFill:       { height: '100%', borderRadius: radius.full },
  caloriesOverflow:   { backgroundColor: colors.heat, position: 'absolute', right: 0, top: 0, bottom: 0 },
  macros:             { gap: spacing.sm },
  mealSection:  { gap: spacing.sm },
  mealHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealLabel:    { letterSpacing: 1.5 },
  entryRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
});
