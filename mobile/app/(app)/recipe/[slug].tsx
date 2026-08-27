import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { appAlert } from '@/components/ui/VirraAlert';
import {
  fetchRecipeDetail, scaleServings, scaleIngredientQuantity, logRecipe,
  fetchFavouriteIds, toggleFavourite, type RecipeDetail,
} from '@/lib/recipes';
import { formatQuantity } from '@/lib/foodUnits';
import { getOrCreateTodayLogId, defaultMealSlot, type MealType } from '@/lib/nutritionLog';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore, personalMetricsFields } from '@/store/profile';
import { buildPersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';

/**
 * One recipe: read it, favourite it, log it.
 *
 * The servings stepper scales the macro strip and the ingredient quantities
 * together, so whatever is on screen is one consistent thing. That matters
 * because "Log this" writes exactly what is displayed; if the two could
 * disagree, the number she logs would not be the number she read.
 *
 * "Log this" writes ONE food_entries row carrying exactly the macros on screen,
 * with quantity_g null and the serving count in the name. See logRecipe().
 */

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MIN_SERVINGS = 0.5;
const MAX_SERVINGS = 12;
const STEP         = 0.5;

function MacroTile({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <View style={styles.macroTile}>
      <VirraText variant="display" size={20} color={colors.breath}>
        {/* Null fibre is unknown, not zero, and a dash says so honestly. */}
        {value === null ? '-' : `${Math.round(value * 10) / 10}`}
      </VirraText>
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
      <VirraText variant="mono" size={9} color={colors.muted}>{unit}</VirraText>
    </View>
  );
}

export default function RecipeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { session }   = useAuthStore();
  const { cycleInfo } = useCycleStore();
  const profile       = useProfileStore();

  const [recipe,   setRecipe]   = useState<RecipeDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [servings, setServings] = useState(1);
  const [meal,     setMeal]     = useState<MealType>(defaultMealSlot());
  const [favourite, setFavourite] = useState(false);
  const [logging,  setLogging]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) { setLoading(false); return; }
      const detail = await fetchRecipeDetail(slug);
      if (cancelled) return;
      setRecipe(detail);
      // Open on one serving of the recipe as written, which is what the
      // ingredient quantities already describe.
      setServings(1);
      setLoading(false);

      if (session) {
        const favs = await fetchFavouriteIds(session.user.id);
        if (!cancelled) setFavourite(favs.includes(slug));
      }
    })();
    return () => { cancelled = true; };
  }, [slug, session]);

  /**
   * The heart flips immediately and rolls back if the write fails. A favourite
   * is a low-stakes toggle; making her wait on the network to see it move
   * would be worse than the rare rollback.
   */
  async function handleFavourite() {
    if (!session || !recipe) return;
    const next = !favourite;
    setFavourite(next);
    const result = await toggleFavourite(session.user.id, recipe.id, next);
    if (result === null) {
      setFavourite(!next);
      appAlert('Could not save that', 'Your favourite did not stick. Try again in a moment.');
    }
  }

  async function handleLog() {
    if (!session || !recipe) return;
    setLogging(true);

    const today = new Date().toISOString().split('T')[0];
    const phase = cycleInfo?.phase ?? null;

    // Infer the day's load so a log created from here carries the same
    // phase/load/targets snapshot as one created on the Nutrition tab.
    let load: TrainingLoad = 'easy';
    try {
      const ctx = await getDailyTrainingContext(session.user.id, today, phase);
      load = ctx.inferred_load;
    } catch {
      // Offline: 'easy' matches the fallback everywhere else.
    }

    const logId = await getOrCreateTodayLogId({
      userId:  session.user.id,
      today,
      phase,
      load,
      metrics: buildPersonalMetrics(personalMetricsFields(profile)),
      inferredLoad: load,
    });

    if (!logId) {
      setLogging(false);
      appAlert('Could not log that', 'We could not open today\'s food log. Check your connection.');
      return;
    }

    const failure = await logRecipe({ logId, mealType: meal, recipe, servings });
    setLogging(false);

    if (failure) {
      appAlert('Could not log that', failure);
      return;
    }

    if (meal !== 'snack') cancelNutritionReminderForMeal(meal);
    router.back();
  }

  const scaled = recipe ? scaleServings(recipe, servings) : null;
  const time   = recipe ? (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0) : 0;

  // Ingredient rows are authored for the whole recipe, so one serving is the
  // authored quantity divided by `serves`, then multiplied back up.
  const quantityFor = (q: number | null) =>
    recipe ? scaleIngredientQuantity(q, recipe.serves, servings) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.pulse} />
          <VirraText variant="mono" size={11} color={colors.pulse}>BACK</VirraText>
        </Pressable>

        {recipe && (
          <Pressable
            onPress={handleFavourite}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ selected: favourite }}
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Save to favourites'}
          >
            <SymbolView
              name={favourite ? 'heart.fill' : 'heart'}
              size={20}
              tintColor={favourite ? colors.heat : colors.muted}
            />
          </Pressable>
        )}
      </View>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}

      {!loading && !recipe && (
        <View style={styles.loading}>
          <VirraText variant="body" size={15} color="rgba(244,237,224,0.75)">
            That recipe is not in the book.
          </VirraText>
        </View>
      )}

      {!loading && recipe && scaled && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.headerBlock}>
            <SectionLabel tone="muted">{recipe.collectionLabel}</SectionLabel>
            <VirraText variant="display" size={30} color={colors.breath}>{recipe.name}</VirraText>
            {recipe.intro && (
              <VirraText variant="body" size={15} color="rgba(244,237,224,0.75)" style={styles.intro}>
                {recipe.intro}
              </VirraText>
            )}
            <View style={styles.metaRow}>
              {time > 0 && (
                <VirraText variant="mono" size={11} color={colors.muted}>{time} MIN</VirraText>
              )}
              <VirraText variant="mono" size={11} color={colors.muted}>
                MAKES {recipe.serves}
              </VirraText>
              {recipe.dietary.map((d) => (
                <View key={d} style={styles.chip}>
                  <VirraText variant="mono" size={9} color={colors.slate}>{d.toUpperCase()}</VirraText>
                </View>
              ))}
            </View>
          </View>

          <VirraCard style={styles.servingsCard}>
            <View style={styles.servingsRow}>
              <SectionLabel>SERVINGS</SectionLabel>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setServings((s) => Math.max(MIN_SERVINGS, Math.round((s - STEP) * 10) / 10))}
                  disabled={servings <= MIN_SERVINGS}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Fewer servings"
                  style={[styles.stepBtn, servings <= MIN_SERVINGS && styles.stepBtnOff]}
                >
                  <SymbolView name="minus" size={14} tintColor={colors.breath} />
                </Pressable>
                <VirraText variant="display" size={20} color={colors.breath} style={styles.servingsValue}>
                  {servings % 1 === 0 ? `${servings}` : servings.toFixed(1)}
                </VirraText>
                <Pressable
                  onPress={() => setServings((s) => Math.min(MAX_SERVINGS, Math.round((s + STEP) * 10) / 10))}
                  disabled={servings >= MAX_SERVINGS}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="More servings"
                  style={[styles.stepBtn, servings >= MAX_SERVINGS && styles.stepBtnOff]}
                >
                  <SymbolView name="plus" size={14} tintColor={colors.breath} />
                </Pressable>
              </View>
            </View>

            <View style={styles.macros}>
              <MacroTile label="KCAL"    unit=""  value={scaled.calories} />
              <MacroTile label="CARBS"   unit="G" value={scaled.carbs_g} />
              <MacroTile label="PROTEIN" unit="G" value={scaled.protein_g} />
              <MacroTile label="FAT"     unit="G" value={scaled.fat_g} />
              <MacroTile label="FIBRE"   unit="G" value={scaled.fibre_g} />
            </View>
          </VirraCard>

          <View style={styles.section}>
            <SectionLabel>INGREDIENTS</SectionLabel>
            {recipe.ingredients.map((i) => {
              const q = quantityFor(i.quantity);
              return (
                <View key={i.position} style={styles.ingredient}>
                  <VirraText variant="mono" size={12} color={colors.pulse} style={styles.qty}>
                    {q === null ? '' : formatQuantity(q, i.unit)}
                  </VirraText>
                  <View style={styles.ingredientMain}>
                    <VirraText variant="body" size={15} color={colors.breath}>{i.foodName}</VirraText>
                    {i.note && (
                      <VirraText variant="body" size={12} color={colors.muted}>{i.note}</VirraText>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <SectionLabel>METHOD</SectionLabel>
            {recipe.steps.map((s) => (
              <View key={s.position} style={styles.step}>
                <VirraText variant="mono" size={12} color={colors.pulse} style={styles.stepNum}>
                  {String(s.position).padStart(2, '0')}
                </VirraText>
                <VirraText variant="body" size={15} color="rgba(244,237,224,0.85)" style={styles.stepBody}>
                  {s.body}
                </VirraText>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {!loading && recipe && scaled && (
        <View style={styles.logBar}>
          <View style={styles.mealPicker}>
            {MEALS.map((m) => {
              const on = m === meal;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMeal(m)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Log as ${m}`}
                  style={[styles.mealChip, on && styles.mealChipOn]}
                >
                  <VirraText variant="mono" size={10} color={on ? colors.mile : colors.breath}>
                    {m.toUpperCase()}
                  </VirraText>
                </Pressable>
              );
            })}
          </View>
          <VirraButton
            label={`Log this  ${Math.round(scaled.calories)} kcal`}
            onPress={handleLog}
            loading={logging}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.mile },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs,
  },
  back:   { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  headerBlock: { gap: spacing.xs },
  intro:       { lineHeight: 22, marginTop: spacing.xs },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: spacing.sm, marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },

  servingsCard:  { gap: spacing.md },
  servingsRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 32, height: 32, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.control,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnOff:    { opacity: 0.35 },
  servingsValue: { minWidth: 34, textAlign: 'center' },

  macros:    { flexDirection: 'row', justifyContent: 'space-between' },
  macroTile: { alignItems: 'center', gap: 1, flex: 1 },

  section: { gap: spacing.sm },

  ingredient:     { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  qty:            { minWidth: 62, paddingTop: 3 },
  ingredientMain: { flex: 1, gap: 1 },

  logBar: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.mile,
  },
  mealPicker: { flexDirection: 'row', gap: spacing.xs },
  mealChip: {
    flex: 1, alignItems: 'center',
    borderWidth: 1, borderColor: colors.control, borderRadius: radius.full,
    paddingVertical: spacing.xs,
  },
  mealChipOn: { backgroundColor: colors.pulse, borderColor: colors.pulse },

  step:     { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum:  { paddingTop: 3 },
  stepBody: { flex: 1, lineHeight: 22 },
});
