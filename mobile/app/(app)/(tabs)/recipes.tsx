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
  fetchFavouriteIds, groupByCollection, searchRecipesRanked, type Recipe,
} from '@/lib/recipes';
import {
  rankRecipes, recipesForPhase, remainingForSlot, slotIsCovered, lightestFirst,
} from '@/lib/recipeMatch';
import { defaultMealSlot, type MealType } from '@/lib/nutritionLog';
import { resolveNutritionTargets, buildPersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import { RecipeRow, macroLine, timeLine } from '@/components/recipes/RecipeRow';

/**
 * The recipe book. Replaces the holding page left when the education library
 * was descoped (card 214).
 *
 * Rails sit above the collections: what she has saved, what suits today's cycle
 * phase, and what fits the macros still left in the current meal slot. The last
 * two are ordered by recipeMatch.ts, which is a pure function and carries the
 * reasoning; this screen only fetches and renders.
 *
 * Logging happens on the detail screen, not here.
 */

const DIETARY_ASKED_KEY = 'virra:recipes_dietary_asked';

const DIETARY_OPTIONS: { value: string; label: string }[] = [
  { value: 'vegetarian',  label: 'Vegetarian' },
  { value: 'vegan',       label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'gf',          label: 'Gluten free' },
  { value: 'df',          label: 'Dairy free' },
  { value: 'nf',          label: 'Nut free' },
];

const SLOT_LABEL: Record<MealType, string> = {
  breakfast: 'BREAKFAST',
  lunch:     'LUNCH',
  dinner:    'DINNER',
  snack:     'A SNACK',
};

// Read as a sentence rather than slotted into the one above: "A SNACK IS
// COVERED" is not a thing anybody says.
const SLOT_COVERED_LABEL: Record<MealType, string> = {
  breakfast: 'BREAKFAST IS COVERED',
  lunch:     'LUNCH IS COVERED',
  dinner:    'DINNER IS COVERED',
  snack:     'SNACKS ARE COVERED',
};

const SLOT_SHARE_NOUN: Record<MealType, string> = {
  breakfast: 'breakfast',
  lunch:     'lunch',
  dinner:    'dinner',
  snack:     'snacks',
};

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

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
      <VirraCard>
        <View style={styles.railTop}>
          {/* The label has to give way, not the time: "Pre-run and race morning"
              is wider than the card, and left to itself it runs straight into
              the minutes with no gap. */}
          <VirraText
            variant="label" color={colors.muted}
            numberOfLines={1} style={styles.railMeta}
          >
            {recipe.collectionLabel}
          </VirraText>
          {time && <VirraText variant="mono" size={10} color={colors.muted}>{time}</VirraText>}
        </View>
        {/* Content flows top-down under the meta line so nothing is pushed into
            the middle of the card; see railChips for why the tag row is always
            rendered even when a recipe has no dietary tags. */}
        <View style={styles.railBody}>
          <VirraText
            variant="display" size={19} color={colors.breath}
            numberOfLines={2} style={styles.railTitle}
          >
            {recipe.name}
          </VirraText>
          <VirraText variant="mono" size={11} color={colors.pulse}>{macroLine(recipe)}</VirraText>
          <View style={[styles.chips, styles.railChips]}>
            {recipe.dietary.map((d) => (
              <View key={d} style={styles.chip}>
                <VirraText variant="mono" size={9} color={colors.slate}>{d.toUpperCase()}</VirraText>
              </View>
            ))}
          </View>
        </View>
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
  const [favIds,    setFavIds]    = useState<string[]>([]);

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
      // Re-read on focus so a heart tapped on the detail screen is reflected
      // the moment she comes back.
      fetchFavouriteIds(session.user.id)
        .then((ids) => { if (!cancelled) setFavIds(ids); });
    }
    return () => { cancelled = true; };
  }, [session, today, slot]));

  const metrics   = buildPersonalMetrics(personalMetricsFields(profile));
  const targets   = resolveNutritionTargets(metrics, phase, load);
  const remaining = remainingForSlot(targets, slot, slotEaten);
  const ctx       = { slot, phase, load, remaining, requires: prefs };

  const searching = query.trim().length > 0;
  const results   = searchRecipesRanked(recipes, query);
  const phaseRail = recipesForPhase(recipes, phase, ctx);
  const covered   = slotIsCovered(remaining);
  const fitsRail  = covered ? lightestFirst(recipes, ctx) : rankRecipes(recipes, ctx);
  const groups    = groupByCollection(recipes);
  // Ordered by when they were favourited, which fetchFavouriteIds already does.
  const favourites = favIds
    .map((id) => recipes.find((r) => r.id === id))
    .filter((r): r is Recipe => Boolean(r));

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
            {results.map(({ recipe, match }) => (
              <RecipeRow
                key={recipe.id}
                recipe={recipe}
                containsQuery={match === 'ingredient' ? query : undefined}
              />
            ))}
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

            {/* FAVOURITES, matching the heart that puts a recipe here and
                every name the code uses for it. "Saved" was the one place
                that called the same thing something else. */}
            <Rail label="FAVOURITES" recipes={favourites} />

            <Rail label="FOR YOUR PHASE" recipes={phaseRail} />

            {/* Once the slot is covered the rail cannot answer "what fits what
                is left", so it changes the question instead of dressing up an
                order that no longer means anything. The copy promises exactly
                what `lightestFirst` delivers. */}
            <Rail
              label={covered ? SLOT_COVERED_LABEL[slot] : `FITS WHAT IS LEFT FOR ${SLOT_LABEL[slot]}`}
              hint={covered
                ? `Already at your share for ${SLOT_SHARE_NOUN[slot]}. Lightest first, in case you are still hungry.`
                : `Around ${Math.round(remaining.calories)} kcal and ${Math.round(remaining.protein_g)}g of protein still to go.`}
              recipes={fitsRail.slice(0, 8)}
            />

            {/* One row per shelf rather than every recipe inline. The old
                version mounted the whole book in a single un-virtualised
                scroll, which was already long at twenty-eight recipes and does
                not survive the recipe packs. The rails above answer "what
                now"; this answers "show me everything in here". */}
            <View style={styles.section}>
              <SectionLabel>COLLECTIONS</SectionLabel>
              {groups.map((g) => (
                <Pressable
                  key={g.collection}
                  onPress={() => router.push(`/(app)/collection/${g.collection}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${g.label}, ${g.recipes.length} recipes`}
                >
                  <VirraCard style={styles.row}>
                    <View style={styles.rowMain}>
                      <VirraText variant="bodyMedium" size={15} color={colors.breath}>
                        {g.label}
                      </VirraText>
                      <VirraText variant="mono" size={11} color={colors.muted}>
                        {g.recipes.length === 1 ? '1 RECIPE' : `${g.recipes.length} RECIPES`}
                      </VirraText>
                    </View>
                    <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />
                  </VirraCard>
                </Pressable>
              ))}
            </View>
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
  railBody:      { gap: spacing.xs, marginTop: spacing.sm },
  // The chip row is always reserved so a tag-less recipe does not leave a
  // chip-sized hole under its macros. Cards in a row stretch to the tallest,
  // and the only slack left is a one- versus two-line title, which lands at
  // the bottom of the card as padding rather than as a gap in the middle.
  railTitle:     { lineHeight: 22 },
  railChips:     { minHeight: 18 },
  railTop:       { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'center', gap: spacing.sm },
  railMeta:      { flex: 1 },

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
