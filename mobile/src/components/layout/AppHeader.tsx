import React from 'react';
import { View, Pressable, StyleSheet, Image } from 'react-native';
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
      {title === 'VIRRA' ? (
        <Image source={require('../../../assets/ViRRA.png')} style={styles.logo} />
      ) : (
        <VirraText variant="display" size={24} color={colors.pulse}>
          {title}
        </VirraText>
      )}
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
  header:     { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  logo:       { width: 72, height: 27, resizeMode: 'contain' },
  profileBtn: { padding: spacing.sm, marginLeft: 'auto' },
});
