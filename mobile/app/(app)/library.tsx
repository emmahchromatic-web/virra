import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';

export default function LibraryScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Library" />
      <View style={styles.body}>
        <VirraText variant="serif" color={colors.muted}>
          Education library — coming in Phase B
        </VirraText>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mile },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
