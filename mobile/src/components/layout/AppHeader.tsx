import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface AppHeaderProps {
  title:        string;
  showProfile?: boolean;
}

export function AppHeader({ title, showProfile }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <VirraText variant="display" size={24} color={colors.pulse}>
        {title}
      </VirraText>
      {showProfile && (
        <Pressable
          onPress={() => router.push('/(app)/profile')}
          style={styles.profileBtn}
          accessibilityLabel="Open profile"
          accessibilityRole="button"
        >
          <VirraText variant="mono" color={colors.pulse} size={18}>⊙</VirraText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.mile },
  profileBtn: { padding: spacing.sm },
});
