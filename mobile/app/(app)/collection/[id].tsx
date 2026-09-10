import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';

import { VirraText } from '@/components/ui/VirraText';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { RecipeRow } from '@/components/recipes/RecipeRow';
import { fetchRecipes, type Recipe } from '@/lib/recipes';
import { colors, spacing } from '@/constants/theme';

/**
 * One collection's recipes.
 *
 * The Recipes tab used to render every recipe in every collection inline, in a
 * single un-virtualised scroll. That was already long at twenty-eight recipes
 * and does not survive the recipe packs, so collections became rows that open
 * this screen instead. The tab is now the rails plus one row per shelf, and it
 * stops mattering how big the book gets.
 */
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchRecipes();
      if (cancelled) return;
      setRecipes(rows.filter((r) => r.collection === id));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // The label lives on the recipes rather than in a lookup table, so it is only
  // known once they arrive. Falling back to the id would flash a slug.
  const label = recipes[0]?.collectionLabel ?? '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <SymbolView name="chevron.left" size={16} tintColor={colors.pulse} />
          <VirraText variant="mono" size={11} color={colors.pulse}>BACK</VirraText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.pulse} />
          </View>
        )}

        {!loading && (
          <>
            <View style={styles.title}>
              <VirraText variant="display" size={32} color={colors.breath}>{label}</VirraText>
              <SectionLabel tone="muted">
                {recipes.length === 1 ? '1 RECIPE' : `${recipes.length} RECIPES`}
              </SectionLabel>
            </View>

            {recipes.map((r) => <RecipeRow key={r.id} recipe={r} />)}

            {recipes.length === 0 && (
              <VirraText variant="body" size={14} color={colors.muted}>
                Nothing in this collection yet.
              </VirraText>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.mile },
  header:  { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  back:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  scroll:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  title:   { gap: 2, marginBottom: spacing.xs },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
});
