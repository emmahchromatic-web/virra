import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { SectionLabel } from '@/components/ui/SectionLabel';
import {
  fetchRecipeDetail, scaleServings, scaleIngredientQuantity, type RecipeDetail,
} from '@/lib/recipes';
import { formatQuantity } from '@/lib/foodUnits';

/**
 * One recipe, read only.
 *
 * The servings stepper scales the macro strip and the ingredient quantities
 * together, so whatever is on screen is one consistent thing. That matters
 * because PR 3's "Log this" writes exactly what is displayed here; if the two
 * could disagree, the number she logs would not be the number she read.
 *
 * There is no logging action yet. Adding it is PR 3 (card 214).
 */

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

  const [recipe,   setRecipe]   = useState<RecipeDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [servings, setServings] = useState(1);

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
    })();
    return () => { cancelled = true; };
  }, [slug]);

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.mile },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
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

  step:     { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum:  { paddingTop: 3 },
  stepBody: { flex: 1, lineHeight: 22 },
});
