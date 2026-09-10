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
  photos:        'photo.on.rectangle',
};

const TINT: Record<PermissionItem['id'], string> = {
  health:        colors.heat,
  location:      colors.breath,
  notifications: colors.dawn,
  camera:        colors.pulse,
  photos:        colors.dawn,
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

/**
 * What tapping the pill will do, said plainly.
 *
 * A granted permission used to say nothing at all, which left the pill looking
 * decorative on exactly the rows where someone most often wants to go and turn
 * something off.
 */
function actionLabel(entry: PermissionStatusEntry | undefined): string {
  if (!entry) return '';
  if (entry.status === 'undetermined' || entry.canAskAgain) return 'TAP TO GRANT';
  return 'TAP TO OPEN IOS SETTINGS';
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
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Permissions</VirraText>
        <View style={{ width: 18 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {PERMISSIONS.map((item) => {
          const entry = entries.find((e) => e.id === item.id);
          const status = entry?.status ?? 'undetermined';
          return (
            <VirraCard key={item.id} style={styles.card}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: `${TINT[item.id]}22` }]}>
                  <SymbolView name={ICON[item.id]} size={18} tintColor={TINT[item.id]} />
                </View>
                <View style={styles.titleWrap}>
                  <VirraText variant="bodyMedium" size={15} color={colors.breath}>
                    {item.title}
                  </VirraText>
                  <VirraText variant="body" size={12} color="rgba(244,237,224,0.55)" style={{ marginTop: 2 }}>
                    {item.body}
                  </VirraText>
                </View>
                {/* The PILL is the control, not the whole card. A card-sized
                    target with a second Pressable nested inside it meant a tap
                    could do either of two things depending where it landed,
                    and neither was signposted. Emma's call from the build 14
                    regression pass. */}
                <Pressable
                  onPress={() => entry && handlePress(item, entry)}
                  disabled={!entry}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} permission, ${STATUS_LABEL[status]}. ${actionLabel(entry)}`}
                  style={[styles.badge, { borderColor: statusColor(status) }]}
                >
                  <VirraText variant="mono" size={11} color={statusColor(status)}>
                    {STATUS_LABEL[status]}
                  </VirraText>
                </Pressable>
              </View>
              {entry && (
                <VirraText variant="mono" size={10} color={colors.muted} style={styles.action}>
                  {actionLabel(entry)}
                </VirraText>
              )}
            </VirraCard>
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
  header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: spacing.lg },
  backBtn:   { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  scroll:    { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card:      { gap: spacing.sm },
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap:  { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  badge:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  action:    { letterSpacing: 1.5, paddingLeft: 36 + spacing.md },
  footnote:  { lineHeight: 18, marginTop: spacing.sm },
});
