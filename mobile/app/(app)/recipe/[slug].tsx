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
  stepServings, formatServings, MIN_SERVINGS, MAX_SERVINGS,
  noteStatesAnAmount, type RecipeDetail,
} from '@/lib/recipes';
import { formatQuantity } from '@/lib/foodUnits';
import { getOrCreateTodayLogId, defaultMealSlot, type MealType } from '@/lib/nutritionLog';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore, personalMetricsFields } from '@/store/profile';
import { useRecipesStore } from '@/store/recipes';
import { buildPersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';
import { ProScreen } from '@/components/ui/ProScreen';

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


/** Both stepper icons share one explicit weight, so the minus and the plus
 *  cannot render at different visual weights side by side. */
const STEPPER_WEIGHT = 'medium' as const;

/** One text size for everything in the meta row, time and pills alike. */
const META_SIZE = 10;

function MacroTile(
  { label, value, dp = 1 }:
  { label: string; value: number | null; dp?: 0 | 1 },
) {
  return (
    <View style={styles.macroTile}>
      <VirraText variant="display" size={20} color={colors.breath}>
        {/* Null fibre is unknown, not zero, and a dash says so honestly.
            Calories are shown whole: nobody eats half a kilocalorie, and a
            figure like 382.5 claims a precision the underlying data does not
            have. Grams keep a decimal, where 12.5 g of protein is a real
            difference from 12 g. */}
        {value === null ? '-' : `${Math.round(value * 10 ** dp) / 10 ** dp}`}
      </VirraText>
      {/* No separate unit line: KCAL names its own unit, and everything else on
          the strip is grams, so a "G" under four of five tiles only made the
          tiles different heights. */}
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
    </View>
  );
}

function RecipeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { session }   = useAuthStore();
  const { cycleInfo } = useCycleStore();
  const profile       = useProfileStore();

  const [recipe,   setRecipe]   = useState<RecipeDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [servings, setServings] = useState(1);
  const [meal,     setMeal]     = useState<MealType>(defaultMealSlot());
  const [logging,  setLogging]  = useState(false);

  // Derived from the shared `recipes` store, not a local copy -- the same
  // cache the Recipes tab's FAVOURITES rail reads (`recipes.tsx:220`), so a
  // toggle made here is visible there without a separate round trip.
  const favourite = useRecipesStore((s) => s.favouriteIds.includes(recipe?.id ?? ''));

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
        // Refreshes the SHARED store cache rather than a screen-local fetch,
        // so this screen and the tab's FAVOURITES rail never disagree.
        void useRecipesStore.getState().refreshFavourites(session.user.id);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, session]);

  /**
   * The heart flips immediately via the store's own optimistic update. It no
   * longer rolls back here on a mere write failure -- offline is a NORMAL
   * outcome for a low-stakes toggle, not a reason to flash the heart back
   * before she can see it settle. `useRecipesStore.toggleFavourite` queues
   * the write through the outbox unconditionally, and only a DEAD-LETTERED
   * item (one that has proven it can never succeed) reverts it, via
   * `syncPending.ts`'s reconciliation calling `revertLocalToggle` -- see
   * store/recipes.ts's `toggleFavourite` doc comment for the full reasoning.
   */
  async function handleFavourite() {
    if (!session || !recipe) return;
    await useRecipesStore.getState().toggleFavourite(session.user.id, recipe.id, !favourite);
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
  // The notes read as authored only when the quantities shown are the
  // authored ones, which is when the servings asked for match `serves`.
  const notesAsWritten = recipe ? servings === recipe.serves : true;
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
              {/* The time reads as plain text and the dietary tags as pills, so
                  the two are told apart by shape, and share one text size so
                  the row reads as a row. How many it makes is left to the
                  Servings card below rather than said twice. */}
              {time > 0 && (
                <VirraText variant="mono" size={META_SIZE} color={colors.muted}>
                  {`${time} MIN`}
                </VirraText>
              )}
              {recipe.dietary.map((d) => (
                <View key={d} style={styles.chip}>
                  <VirraText variant="mono" size={META_SIZE} color={colors.slate}>{d.toUpperCase()}</VirraText>
                </View>
              ))}
            </View>
          </View>

          <VirraCard style={styles.servingsCard}>
            <View style={styles.servingsRow}>
              <SectionLabel>SERVINGS</SectionLabel>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setServings((s) => stepServings(s, -1))}
                  disabled={servings <= MIN_SERVINGS}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Fewer servings"
                  style={[styles.stepBtn, servings <= MIN_SERVINGS && styles.stepBtnOff]}
                >
                  <SymbolView name="minus" size={14} weight={STEPPER_WEIGHT} tintColor={colors.breath} />
                </Pressable>
                <VirraText variant="display" size={20} color={colors.breath} style={styles.servingsValue}>
                  {formatServings(servings)}
                </VirraText>
                <Pressable
                  onPress={() => setServings((s) => stepServings(s, 1))}
                  disabled={servings >= MAX_SERVINGS}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="More servings"
                  style={[styles.stepBtn, servings >= MAX_SERVINGS && styles.stepBtnOff]}
                >
                  <SymbolView name="plus" size={14} weight={STEPPER_WEIGHT} tintColor={colors.breath} />
                </Pressable>
              </View>
            </View>

            <View style={styles.macros}>
              <MacroTile label="KCAL"    value={scaled.calories} dp={0} />
              <MacroTile label="CARBS"   value={scaled.carbs_g} />
              <MacroTile label="PROTEIN" value={scaled.protein_g} />
              <MacroTile label="FAT"     value={scaled.fat_g} />
              <MacroTile label="FIBRE"   value={scaled.fibre_g} />
            </View>
          </VirraCard>

          <View style={styles.section}>
            <SectionLabel>INGREDIENTS</SectionLabel>
            {/* Quantities are scaled to the servings asked for, while the notes
                were authored against the recipe as written, so the two only
                agree when those match. Say which the numbers are, and drop the
                notes that state an amount rather than print two of them. */}
            {!notesAsWritten && (
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.ingredientHint}>
                {/* "Scaled from", not "scaled to": it reads correctly whether
                    the servings went up or down, and the stepper above already
                    shows the number they went to. */}
                {`SCALED FROM ${recipe.serves} ${recipe.serves === 1 ? 'SERVING' : 'SERVINGS'}`}
              </VirraText>
            )}
            {recipe.ingredients.map((i) => {
              const q    = quantityFor(i.quantity);
              const note = i.note && (notesAsWritten || !noteStatesAnAmount(i.note)) ? i.note : null;
              return (
                <View key={i.position} style={styles.ingredient}>
                  <VirraText variant="mono" size={12} color={colors.pulse} style={styles.qty}>
                    {q === null ? '' : formatQuantity(q, i.unit)}
                  </VirraText>
                  <View style={styles.ingredientMain}>
                    <VirraText variant="body" size={15} color={colors.breath}>{i.foodName}</VirraText>
                    {note && (
                      <VirraText variant="body" size={12} color={colors.muted}>{note}</VirraText>
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
  // A fixed width, not a minimum. With minWidth any quantity longer than the
  // column ("0.5 tbsp" measures ~69pt) pushed only that row's food name to the
  // right, so names stopped lining up. 76pt fits eight mono characters with room
  // to spare; anything longer wraps inside the column instead of shoving the name.
  qty:            { width: 76, paddingTop: 3 },
  ingredientMain: { flex: 1, gap: 1 },
  ingredientHint: { lineHeight: 18, marginTop: -spacing.xs },

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

// Card 298. Whole-screen gate. The tabs keep a free user away from this
// route; a notification tap, a stale link or a back-swipe can still land
// here, and the screen would otherwise render for something she does not
// have. Same locked card as the tiles, plus a back button.
export default function GatedRecipeDetailScreen() {
  return (
    <ProScreen feature="recipes">
      <RecipeDetailScreen />
    </ProScreen>
  );
}
