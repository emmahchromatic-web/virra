import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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
          onPress={() => router.push('/(app)/(tabs)/profile')}
          style={styles.profileBtn}
          accessibilityLabel="Open profile"
          accessibilityRole="button"
        >
          <SymbolView name="person.circle" size={24} tintColor={colors.pulse} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { height: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  profileBtn: { padding: spacing.sm },
});
