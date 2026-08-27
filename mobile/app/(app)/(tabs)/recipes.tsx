import React, { useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, Pressable, TextInput, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore, personalMetricsFields } from '@/store/profile';
import {
  fetchRecipes, fetchSlotTotals, fetchDietaryPrefs, saveDietaryPrefs,
  groupByCollection, searchRecipes, type Recipe,
} from '@/lib/recipes';
import { rankRecipes, recipesForPhase, remainingForSlot } from '@/lib/recipeMatch';
import { defaultMealSlot, type MealType } from '@/lib/nutritionLog';
import { resolveNutritionTargets, buildPersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';

/**
 * The recipe book. Replaces the holding page left when the education library
 * was descoped (card 214).
 *
 * Two personalised rails sit above the collections: what suits today's cycle
 * phase, and what fits the macros still left in the current meal slot. Both
 * are ordered by recipeMatch.ts, which is a pure function and carries the
 * reasoning; this screen only fetches and renders.
 *
 * Nothing here writes a food entry. Logging a recipe is PR 3.
 */

const DIETARY_ASKED_KEY = 'virra:recipes_dietary_asked';

const DIETARY_OPTIONS: { value: string; label: string }[] = [
  { value: 'vegetarian',  label: 'Vegetarian' },
  { value: 'vegan',       label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'gf',          label: 'Gluten free' },
  { value: 'df',          label: 'Dairy free' },
];

const SLOT_LABEL: Record<MealType, string> = {
  breakfast: 'BREAKFAST',
  lunch:     'LUNCH',
  dinner:    'DINNER',
  snack:     'A SNACK',
};

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function macroLine(r: Recipe): string {
  // Fibre is deliberately absent: it is nullable on the row, and a card is not
  // the place to explain the difference between "no fibre" and "not known".
  return `${Math.round(r.calories)} kcal   C${Math.round(r.carbs_g)}  P${Math.round(r.protein_g)}  F${Math.round(r.fat_g)}`;
}

function timeLine(r: Recipe): string | null {
  const total = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
  if (!total) return null;
  return `${total} MIN`;
}

/** Wide card used inside the horizontal rails. */
function RailCard({ recipe }: { recipe: Recipe }) {
  const time = timeLine(recipe);
  return (
    <Pressable
      onPress={() => router.push(`/(app)/recipe/${recipe.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${recipe.name}`}
      style={styles.railCard}
    >
      <VirraCard style={styles.railCardInner}>
        <View style={styles.railTop}>
          <SectionLabel tone="muted">{recipe.collectionLabel}</SectionLabel>
          {time && <VirraText variant="mono" size={10} color={colors.muted}>{time}</VirraText>}
        </View>
        <VirraText variant="display" size={19} color={colors.breath} numberOfLines={2}>
          {recipe.name}
        </VirraText>
        <VirraText variant="mono" size={11} color={colors.pulse}>{macroLine(recipe)}</VirraText>
        {recipe.dietary.length > 0 && (
          <View style={styles.chips}>
            {recipe.dietary.map((d) => (
              <View key={d} style={styles.chip}>
                <VirraText variant="mono" size={9} color={colors.slate}>{d.toUpperCase()}</VirraText>
              </View>
            ))}
          </View>
        )}
      </VirraCard>
    </Pressable>
  );
}

/** Full-width row used inside the collection lists and search results. */
function RecipeRow({ recipe }: { recipe: Recipe }) {
  const time = timeLine(recipe);
  return (
    <Pressable
      onPress={() => router.push(`/(app)/recipe/${recipe.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${recipe.name}`}
    >
      <VirraCard style={styles.row}>
        <View style={styles.rowMain}>
          <VirraText variant="bodyMedium" size={15} color={colors.breath} numberOfLines={2}>
            {recipe.name}
          </VirraText>
          <VirraText variant="mono" size={11} color={colors.muted}>
            {macroLine(recipe)}{time ? `   ${time}` : ''}
          </VirraText>
        </View>
        <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />
      </VirraCard>
    </Pressable>
  );
}

function Rail({ label, hint, recipes }: { label: string; hint?: string; recipes: Recipe[] }) {
  if (recipes.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionLabel>{label}</SectionLabel>
      {hint && (
        <VirraText variant="body" size={12} color={colors.muted} style={styles.hint}>{hint}</VirraText>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railScroll}
      >
        {recipes.map((r) => <RailCard key={r.id} recipe={r} />)}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dietary prompt
// ---------------------------------------------------------------------------

/**
 * Asked once, on first open, and skippable.
 *
 * The column has existed since before the onboarding diet step was removed, so
 * almost nobody has an answer stored. This is the first screen where the answer
 * changes what she sees, which makes it the honest place to ask rather than
 * lengthening onboarding for a feature she has not met yet.
 */
function DietaryPrompt({ onDone }: { onDone: (prefs: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (value: string) =>
    setSelected((s) => (s.includes(value) ? s.filter((v) => v !== value) : [...s, value]));

  return (
    <VirraCard accent style={styles.prompt}>
      <SectionLabel>BEFORE YOU BROWSE</SectionLabel>
      <VirraText variant="display" size={20} color={colors.breath}>
        Anything you do not eat?
      </VirraText>
      <VirraText variant="body" size={14} color="rgba(244,237,224,0.75)" style={styles.promptBody}>
        We will keep the book filtered to what works for you. You can change this any time, and
        skipping shows you everything.
      </VirraText>
      <View style={styles.chips}>
        {DIETARY_OPTIONS.map((o) => {
          const on = selected.includes(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => toggle(o.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              style={[styles.optionChip, on && styles.optionChipOn]}
            >
              <VirraText variant="mono" size={11} color={on ? colors.mile : colors.breath}>
                {o.label.toUpperCase()}
              </VirraText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.promptActions}>
        <VirraButton label="Save" onPress={() => onDone(selected)} style={styles.promptBtn} />
        <VirraButton label="Skip" variant="ghost" onPress={() => onDone([])} style={styles.promptBtn} />
      </View>
    </VirraCard>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RecipesScreen() {
  const { session }   = useAuthStore();
  const { cycleInfo } = useCycleStore();
  const profile       = useProfileStore();

  const [recipes,   setRecipes]   = useState<Recipe[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [query,     setQuery]     = useState('');
  const [load,      setLoad]      = useState<TrainingLoad>('easy');
  const [prefs,     setPrefs]     = useState<string[]>([]);
  const [askDiet,   setAskDiet]   = useState(false);
  const [slotEaten, setSlotEaten] = useState({ calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 });

  const slot  = defaultMealSlot();
  const today = new Date().toISOString().split('T')[0];
  const phase = cycleInfo?.phase ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const rows = await fetchRecipes();
      if (cancelled) return;
      setRecipes(rows);
      setLoading(false);

      if (!session) return;

      // Asked once per install. The stored answer is the authority; the marker
      // only stops us asking again after somebody has skipped.
      const [asked, stored] = await Promise.all([
        AsyncStorage.getItem(DIETARY_ASKED_KEY),
        fetchDietaryPrefs(session.user.id),
      ]);
      if (cancelled) return;
      setPrefs(stored);
      if (!asked && stored.length === 0) setAskDiet(true);

      try {
        const ctx = await getDailyTrainingContext(session.user.id, today, phase);
        if (!cancelled) setLoad(ctx.inferred_load);
      } catch {
        // Offline: 'easy' is the same fallback the Nutrition tab uses.
      }
    })();

    return () => { cancelled = true; };
  }, [session, today, phase]);

  // What is already in this slot changes every time she logs something, so it
  // is re-read on focus rather than only on mount.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (session) {
      fetchSlotTotals(session.user.id, today, slot)
        .then((t) => { if (!cancelled) setSlotEaten(t); });
    }
    return () => { cancelled = true; };
  }, [session, today, slot]));

  const metrics   = buildPersonalMetrics(personalMetricsFields(profile));
  const targets   = resolveNutritionTargets(metrics, phase, load);
  const remaining = remainingForSlot(targets, slot, slotEaten);
  const ctx       = { slot, phase, load, remaining, requires: prefs };

  const searching = query.trim().length > 0;
  const results   = searchRecipes(recipes, query);
  const phaseRail = recipesForPhase(recipes, phase, ctx);
  const fitsRail  = rankRecipes(recipes, ctx);
  const groups    = groupByCollection(recipes);

  async function handleDietaryDone(next: string[]) {
    setAskDiet(false);
    setPrefs(next);
    await AsyncStorage.setItem(DIETARY_ASKED_KEY, '1');
    if (session && next.length > 0) await saveDietaryPrefs(session.user.id, next);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Recipes" showProfile />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.searchWrap}>
          <SymbolView name="magnifyingglass" size={15} tintColor={colors.muted} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            accessibilityLabel="Search recipes"
          />
          {searching && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <SymbolView name="xmark.circle.fill" size={15} tintColor={colors.muted} />
            </Pressable>
          )}
        </View>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.pulse} />
          </View>
        )}

        {!loading && recipes.length === 0 && (
          <VirraCard style={styles.empty}>
            <SectionLabel>NOTHING HERE YET</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.75)">
              The recipe book is still being written. Your daily targets and food logging live on
              the Nutrition tab in the meantime.
            </VirraText>
          </VirraCard>
        )}

        {!loading && recipes.length > 0 && searching && (
          <View style={styles.section}>
            <SectionLabel>{results.length === 1 ? '1 RECIPE' : `${results.length} RECIPES`}</SectionLabel>
            {results.map((r) => <RecipeRow key={r.id} recipe={r} />)}
            {results.length === 0 && (
              <VirraText variant="body" size={14} color={colors.muted} style={styles.hint}>
                Nothing matches that. Try a shorter word.
              </VirraText>
            )}
          </View>
        )}

        {!loading && recipes.length > 0 && !searching && (
          <>
            {askDiet && <DietaryPrompt onDone={handleDietaryDone} />}

            <Rail label="FOR YOUR PHASE" recipes={phaseRail} />

            <Rail
              label={`FITS WHAT IS LEFT FOR ${SLOT_LABEL[slot]}`}
              hint={`Around ${Math.round(remaining.calories)} kcal and ${Math.round(remaining.protein_g)}g of protein still to go.`}
              recipes={fitsRail.slice(0, 8)}
            />

            {groups.map((g) => (
              <View key={g.collection} style={styles.section}>
                <SectionLabel>{g.label}</SectionLabel>
                {g.recipes.map((r) => <RecipeRow key={r.id} recipe={r} />)}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.mile },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.mist, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.control,
    paddingHorizontal: spacing.md, height: 42,
  },
  search: { flex: 1, color: colors.breath, fontSize: 15, padding: 0 },

  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  empty:   { gap: spacing.sm },

  section: { gap: spacing.sm },
  hint:    { lineHeight: 18 },

  railScroll:    { gap: spacing.sm, paddingRight: spacing.lg },
  railCard:      { width: 236 },
  railCardInner: { gap: spacing.xs, minHeight: 132 },
  railTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  row:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMain: { flex: 1, gap: 2 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },

  prompt:        { gap: spacing.sm },
  promptBody:    { lineHeight: 20 },
  promptActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  promptBtn:     { flex: 1 },
  optionChip: {
    borderWidth: 1, borderColor: colors.control, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  optionChipOn: { backgroundColor: colors.pulse, borderColor: colors.pulse },
});
