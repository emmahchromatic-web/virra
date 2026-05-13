import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import {
  PERMISSIONS,
  getPermissionsStatus,
  requestPermission,
  type PermissionItem,
  type PermissionStatusEntry,
} from '@/lib/permissionsConfig';

const ICON: Record<PermissionItem['id'], SymbolViewProps['name']> = {
  health:        'heart.fill',
  location:      'location.fill',
  notifications: 'bell.fill',
  camera:        'camera.fill',
};

const TINT: Record<PermissionItem['id'], string> = {
  health:        colors.heat,
  location:      colors.breath,
  notifications: colors.dawn,
  camera:        colors.pulse,
};

const STATUS_LABEL: Record<string, string> = {
  granted:      'ALLOWED',
  denied:       'DENIED',
  undetermined: 'NOT SET',
};

function statusColor(status: string): string {
  if (status === 'granted') return colors.pulse;
  if (status === 'denied')  return colors.heat;
  return colors.muted as string;
}

export default function PermissionsStatusScreen() {
  const [entries, setEntries] = useState<PermissionStatusEntry[]>([]);

  const reload = useCallback(async () => {
    const next = await getPermissionsStatus();
    setEntries(next);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  async function handlePress(item: PermissionItem, entry: PermissionStatusEntry) {
    // If never asked OR can still ask, fire the native prompt. Otherwise deep-link to Settings.
    if (entry.status === 'undetermined' || entry.canAskAgain) {
      await requestPermission(item.id);
    } else {
      Linking.openSettings();
    }
    reload();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={22} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="display" size={20} color={colors.breath}>PERMISSIONS</VirraText>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {PERMISSIONS.map((item) => {
          const entry = entries.find((e) => e.id === item.id);
          const status = entry?.status ?? 'undetermined';
          return (
            <Pressable key={item.id} onPress={() => entry && handlePress(item, entry)}>
              <VirraCard style={styles.card}>
                <View style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: `${TINT[item.id]}22` }]}>
                    <SymbolView name={ICON[item.id]} size={18} tintColor={TINT[item.id]} />
                  </View>
                  <View style={styles.titleWrap}>
                    <VirraText variant="bodyMedium" size={15} color={colors.breath}>
                      {item.label.replace(/ \+ .*/, '').replace(/S$/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                    </VirraText>
                    <VirraText variant="body" size={12} color="rgba(244,237,224,0.55)" style={{ marginTop: 2 }}>
                      {item.body}
                    </VirraText>
                  </View>
                  <View style={[styles.badge, { borderColor: statusColor(status) }]}>
                    <VirraText variant="mono" size={9} color={statusColor(status)}>
                      {STATUS_LABEL[status]}
                    </VirraText>
                  </View>
                </View>
                {entry && status !== 'granted' && (
                  <VirraText variant="mono" size={10} color={colors.pulse} style={styles.action}>
                    {entry.status === 'undetermined' || entry.canAskAgain ? 'TAP TO GRANT' : 'TAP TO OPEN SETTINGS'}
                  </VirraText>
                )}
                {item.id === 'health' && status === 'granted' && (
                  <Pressable onPress={() => Linking.openURL('x-apple-health://')}>
                    <VirraText variant="mono" size={10} color={colors.heat} style={styles.action}>
                      VIEW IN HEALTH
                    </VirraText>
                  </Pressable>
                )}
              </VirraCard>
            </Pressable>
          );
        })}
        <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={styles.footnote}>
          iOS hides which specific Health data types you&apos;ve allowed Virra to read.
          Manage individual permissions in the Health app under Sharing → Apps.
        </VirraText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scroll:    { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card:      { gap: spacing.sm },
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap:  { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  badge:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  action:    { letterSpacing: 1.5, paddingLeft: 36 + spacing.md },
  footnote:  { lineHeight: 18, marginTop: spacing.sm },
});
