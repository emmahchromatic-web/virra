import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { useAuthStore } from '@/store/auth';
import { VirraText } from '@/components/ui/VirraText';
import { DeadLetterSheet } from '@/components/ui/DeadLetterSheet';
import { colors, spacing, radius } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PillState = 'offline' | 'syncing' | 'synced' | 'failed' | null;

function deriveState(
  isOnline: boolean, pendingCount: number, deadLetterCount: number, justSynced: boolean,
): PillState {
  if (deadLetterCount > 0) return 'failed';
  if (!isOnline) return 'offline';
  // Not `syncing && pendingCount > 0`: syncing is only true for the literal
  // duration of a drain() call, but a retryable failure halts the drain and
  // leaves pendingCount > 0 with syncing already back to false -- a queue
  // that can't currently drain still has real unsynced work, and needs to
  // stay visible until it does or until it dead-letters.
  if (pendingCount > 0) return 'syncing';
  if (justSynced) return 'synced';
  return null;
}

const CONFIG: Record<Exclude<PillState, null>, { icon: string; label: string }> = {
  offline: { icon: 'wifi.slash', label: 'Offline' },
  syncing: { icon: 'arrow.triangle.2.circlepath', label: 'Syncing' },
  synced:  { icon: 'checkmark', label: 'Synced' },
  failed:  { icon: 'exclamationmark.triangle', label: 'Unsaved' },
};

export function SyncPill() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const pendingCount = useOutboxStatus((s) => s.pendingCount);
  const deadLetterCount = useOutboxStatus((s) => s.deadLetterCount);
  const justSynced = useOutboxStatus((s) => s.justSynced);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const state = deriveState(isOnline, pendingCount, deadLetterCount, justSynced);
  const [sheetVisible, setSheetVisible] = useState(false);

  // react-native-reanimated is not a dependency of this app; a single fade
  // does not justify adding a new native module this close to submission,
  // so this uses React Native core's Animated API instead.
  const opacity = useRef(new Animated.Value(state ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: state ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [state, opacity]);

  useEffect(() => {
    if (state !== 'synced') return;
    const t = setTimeout(() => useOutboxStatus.getState().setJustSynced(false), 1500);
    return () => clearTimeout(t);
  }, [state]);

  if (!state) return null;
  const { icon, label } = CONFIG[state];
  const isFailed = state === 'failed';

  return (
    <>
      <AnimatedPressable
        style={[styles.pill, { opacity }]}
        pointerEvents={isFailed ? 'auto' : 'none'}
        disabled={!isFailed}
        onPress={isFailed ? () => setSheetVisible(true) : undefined}
        accessibilityRole={isFailed ? 'button' : undefined}
        accessibilityLabel={isFailed ? 'View unsaved items' : undefined}
      >
        <SymbolView name={icon as never} size={12} tintColor={colors.breath} />
        <VirraText variant="mono" size={11} color={colors.breath}>{label}</VirraText>
      </AnimatedPressable>
      {isFailed && (
        <DeadLetterSheet visible={sheetVisible} userId={userId} onClose={() => setSheetVisible(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position:        'absolute',
    top:              spacing.sm,
    alignSelf:        'center',
    flexDirection:    'row',
    alignItems:       'center',
    gap:              spacing.xs,
    backgroundColor:  colors.mist,
    paddingHorizontal: spacing.sm,
    paddingVertical:  spacing.xs,
    borderRadius:     radius.full,
    zIndex:           50,
  },
});
