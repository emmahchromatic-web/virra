import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

/**
 * Holding page. The shortcut is wired now so the profile layout is settled and
 * the route is stable, but the achievements themselves are still being defined,
 * and shipping a half-invented set would be worse than shipping none: they are
 * the sort of thing people screenshot, so the first list needs to be the right
 * one. Card 3.
 */
export default function AchievementsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={20} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="display" size={20} color={colors.pulse}>Achievements</VirraText>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        <VirraCard style={styles.card}>
          <SymbolView name="rosette" size={34} tintColor={colors.pulse} />
          <VirraText variant="display" size={22} color={colors.breath} style={{ textAlign: 'center' }}>
            Coming soon
          </VirraText>
          <VirraText variant="body" size={14} color={colors.muted} style={styles.copy}>
            We are still deciding what deserves celebrating. Consistency, first
            distances, sessions completed in each phase, and the weeks you
            trained with your cycle rather than against it are all on the list.
          </VirraText>
          <VirraText variant="body" size={13} color={colors.muted} style={styles.copy}>
            Everything you log between now and then still counts towards them.
          </VirraText>
        </VirraCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.mile },
  header: {
    height: 52, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: spacing.lg,
  },
  body:   { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card:   { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  copy:   { textAlign: 'center', lineHeight: 21 },
});
