import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { VirraText } from '@/components/ui/VirraText';
import { colors, fonts, spacing } from '@/constants/theme';
import { useNotificationsStore, NotificationItem } from '@/store/notifications';
import { formatRelativeTime } from '@/lib/relativeTime';
import { appAlert } from '@/components/ui/VirraAlert';

function Row({ item, showUnreadDot }: { item: NotificationItem; showUnreadDot: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.dotCol}>
        {showUnreadDot && <View style={styles.dot} />}
      </View>
      <View style={styles.body}>
        <VirraText variant="bodyMedium" color={colors.breath}>{item.title || ' '}</VirraText>
        {item.body.length > 0 && (
          <VirraText variant="body" color={colors.muted} numberOfLines={3} style={styles.bodyText}>
            {item.body}
          </VirraText>
        )}
      </View>
      <View style={styles.tsCol}>
        <VirraText variant="mono" color={colors.muted}>{formatRelativeTime(item.deliveredAt)}</VirraText>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const items       = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const clear       = useNotificationsStore((s) => s.clear);

  // Freeze a snapshot of which items were unread at mount so the user can still
  // see the dots while viewing the screen. Initialised inline (not in an effect)
  // so the snapshot is correct on the very first render — no one-frame flash.
  const unreadOnMount = useRef<Set<string>>(
    new Set(items.filter((it) => it.readAt === null).map((it) => it.id)),
  );
  useEffect(() => {
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sort defensively in case persistence rehydrated out of order.
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt)),
    [items],
  );

  const confirmClear = () => {
    appAlert(
      'Clear all notifications?',
      'This removes the inbox history on this device. Notifications already delivered by the OS are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear',  style: 'destructive', onPress: () => { clear(); } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Notifications</VirraText>
        <View style={styles.headerBtn} />
      </View>
      {sorted.length > 0 && (
        <View style={styles.toolbar}>
          <Pressable onPress={confirmClear} accessibilityRole="button" accessibilityLabel="Clear all notifications">
            <VirraText variant="mono" color={colors.muted}>CLEAR ALL</VirraText>
          </Pressable>
        </View>
      )}
      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <VirraText variant="serif" color={colors.muted}>No notifications yet.</VirraText>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Row item={item} showUnreadDot={unreadOnMount.current.has(item.id)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: colors.mile },
  header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  toolbar:   { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  list:      { paddingBottom: spacing.xl },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  row:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.mist },
  dotCol:    { width: 16, alignItems: 'flex-start', paddingTop: 6 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pulse },
  body:      { flex: 1, paddingRight: spacing.md },
  bodyText:  { marginTop: 2, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  tsCol:     { paddingTop: 4, minWidth: 64, alignItems: 'flex-end' },
});
