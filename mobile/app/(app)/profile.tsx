import React from 'react';
import { View, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <VirraText variant="display" size={28} color={colors.pulse}>Profile</VirraText>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close profile">
          <VirraText variant="mono" color={colors.muted}>✕</VirraText>
        </Pressable>
      </View>

      <View style={styles.body}>
        <VirraCard>
          <VirraText variant="label" color={colors.muted}>Account</VirraText>
          <VirraText variant="bodyMedium" color={colors.breath} style={{ marginTop: spacing.xs }}>
            {user?.email ?? '—'}
          </VirraText>
        </VirraCard>

        <VirraCard style={{ marginTop: spacing.sm }}>
          <VirraText variant="label" color={colors.muted}>Subscription</VirraText>
          <VirraText variant="bodyMedium" color={colors.breath} style={{ marginTop: spacing.xs }}>
            Manage in Settings → Subscriptions
          </VirraText>
        </VirraCard>

        <VirraText variant="label" color={colors.muted} style={styles.phaseNote}>
          Fitness profile, cycle settings, and notification preferences — Phase B
        </VirraText>

        <VirraButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signout}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  body:      { flex: 1, padding: spacing.lg },
  phaseNote: { textAlign: 'center', marginTop: spacing.xl },
  signout:   { marginTop: spacing.lg },
});
