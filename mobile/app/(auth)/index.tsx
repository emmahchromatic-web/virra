import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

export default function WelcomeScreen() {

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <VirraText variant="display" size={72} color={colors.pulse}>
            VIRRA
          </VirraText>
          <VirraText variant="serif" size={20} color={colors.breath} style={styles.sub}>
            Train with your cycle, not against it.
          </VirraText>
        </View>

        <View style={styles.actions}>
          <VirraButton
            label="Get started — free trial"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <VirraButton
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/sign-in')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  hero:      { flex: 1, justifyContent: 'center' },
  sub:       { marginTop: spacing.md },
  actions:   { paddingBottom: spacing.xl },
});
