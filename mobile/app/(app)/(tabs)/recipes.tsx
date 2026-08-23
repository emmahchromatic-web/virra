import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

/**
 * Holding page. The education library was descoped and this tab becomes a
 * recipe book instead; the shelves screen it replaced is in git history at
 * app/(app)/(tabs)/library.tsx if any of it is worth reviving.
 */
export default function RecipesScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Recipes" showProfile />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <VirraCard style={styles.card}>
          <View style={styles.iconWrap}>
            <SymbolView name="book.closed" size={30} tintColor={colors.dawn} />
          </View>

          <VirraText variant="mono" size={11} color={colors.pulse} style={styles.eyebrow}>
            COMING SOON
          </VirraText>

          <VirraText variant="display" size={22} color={colors.breath}>
            Food worth looking forward to
          </VirraText>

          <VirraText variant="body" size={15} color="rgba(244,237,224,0.75)" style={styles.body}>
            We are putting together a recipe book built around how you train and where you are in
            your cycle. Meals that hit your targets without needing a second thought, and that you
            would happily cook twice.
          </VirraText>

          <VirraText variant="body" size={15} color="rgba(244,237,224,0.75)" style={styles.body}>
            It will land right here. In the meantime, your daily targets and food logging live on
            the Nutrition tab.
          </VirraText>
        </VirraCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: colors.mile },
  scroll:   { padding: spacing.lg, paddingBottom: spacing.xxl },
  card:     { gap: spacing.md, paddingVertical: spacing.xl },
  iconWrap: { alignItems: 'flex-start', marginBottom: spacing.xs },
  eyebrow:  { letterSpacing: 2 },
  body:     { lineHeight: 22 },
});
