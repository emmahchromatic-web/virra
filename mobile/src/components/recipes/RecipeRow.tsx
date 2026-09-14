import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';

import { VirraCard } from '@/components/ui/VirraCard';
import { VirraText } from '@/components/ui/VirraText';
import { colors, spacing } from '@/constants/theme';
import type { Recipe } from '@/lib/recipes';

/**
 * Fibre is deliberately absent: it is nullable on the row, and a list is not
 * the place to explain the difference between "no fibre" and "not known".
 */
export function macroLine(r: Recipe): string {
  return `${Math.round(r.calories)} kcal   C${Math.round(r.carbs_g)}  P${Math.round(r.protein_g)}  F${Math.round(r.fat_g)}`;
}

export function timeLine(r: Recipe): string | null {
  const total = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
  if (!total) return null;
  return `${total} MIN`;
}

/**
 * Full-width row used by search results and by a collection's own screen.
 *
 * Lives here rather than inside the Recipes tab because the tab no longer
 * renders these itself: collections open their own screen, so the row is shared
 * between two callers.
 */
export function RecipeRow({ recipe, containsQuery }: {
  recipe:         Recipe;
  /**
   * Set when this row matched a search on an INGREDIENT rather than its name,
   * so the row can say why it is here. A recipe called "Mexican Tray Bake"
   * appearing for "chipotle" looks like a bad result unless it explains itself.
   */
  containsQuery?: string;
}) {
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
          {containsQuery ? (
            <VirraText variant="mono" size={10} color={colors.pulse} style={{ letterSpacing: 1 }}>
              CONTAINS {containsQuery.trim().toUpperCase()}
            </VirraText>
          ) : null}
          <VirraText variant="mono" size={11} color={colors.muted}>
            {macroLine(recipe)}{time ? `   ${time}` : ''}
          </VirraText>
        </View>
        <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />
      </VirraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMain: { flex: 1, gap: 2 },
});
