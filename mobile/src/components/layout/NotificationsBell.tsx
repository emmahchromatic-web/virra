import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { useNotificationsStore } from '@/store/notifications';

export function NotificationsBell() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const hasUnread   = unreadCount > 0;

  return (
    <Pressable
      onPress={() => router.push('/(app)/notifications' as any)}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={hasUnread ? `Open notifications, ${unreadCount} unread` : 'Open notifications'}
    >
      <SymbolView
        name={hasUnread ? 'bell.fill' : 'bell'}
        size={24}
        tintColor={colors.pulse}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: spacing.sm },
});
