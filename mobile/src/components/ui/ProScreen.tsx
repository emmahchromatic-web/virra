import React from 'react';
import { View, StyleSheet, SafeAreaView, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { ProLockedCard } from '@/components/ui/ProLockedCard';
import { useIsPro, PRO_FEATURES, type ProFeature } from '@/lib/pro';

interface Props {
  feature:  ProFeature;
  children: React.ReactNode;
}

// Card 298. Wraps a whole Pro screen. The tiles on the tabs already keep a
// free user away from these routes, but a notification tap, a stale deep
// link or a back-swipe can still land here, and the screen underneath would
// otherwise render for a plan she does not have. This is the belt to the
// tiles' braces: same locked card, a back button, nothing else.
export function ProScreen({ feature, children }: Props) {
  const isPro = useIsPro();
  if (isPro) return <>{children}</>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)' as never))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>
          {PRO_FEATURES[feature].kicker}
        </VirraText>
        <View style={{ width: 18 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ProLockedCard feature={feature} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.mile },
  header:  { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  backBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content: { padding: spacing.lg },
});
