import React, { useRef, useEffect, useMemo } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

// Soft require: existing dev builds without expo-haptics still load.
// Haptics start firing once a fresh native build ships.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Haptics: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

export function hapticImpact(style: 'light' | 'medium' = 'medium'): void {
  if (!Haptics) return;
  const lookup = {
    light:  Haptics.ImpactFeedbackStyle?.Light,
    medium: Haptics.ImpactFeedbackStyle?.Medium,
  };
  Haptics.impactAsync?.(lookup[style]).catch(() => {});
}

export interface DraggableSession {
  id:                string;
  modality:          'run' | 'strength' | 'swim' | 'yoga' | 'other';
  session_label:     string;
  estimated_minutes: number;
  isFocused:         boolean;
}

interface Props {
  session:     DraggableSession;
  onLongPress: (id: string, absStartY: number) => void;
  onPanUpdate: (id: string, translationY: number, absoluteY: number) => void;
  onPanEnd:    (id: string, translationY: number, absoluteY: number) => void;
  grabbed:     boolean;
  enabled:     boolean;
}

const MODALITY_COLOUR: Record<DraggableSession['modality'], string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

const MODALITY_ICON: Record<DraggableSession['modality'], SFSymbol> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'circle',
};

export function DraggableSessionCard({ session, onLongPress, onPanUpdate, onPanEnd, grabbed, enabled }: Props) {
  const scale      = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const sessionId  = session.id;

  // Stable refs so the Gesture callbacks always see the latest screen-level
  // handlers: RNGH doesn't hot-swap callbacks on an active touch.
  const cbRef = useRef({ onLongPress, onPanUpdate, onPanEnd });
  useEffect(() => {
    cbRef.current = { onLongPress, onPanUpdate, onPanEnd };
  }, [onLongPress, onPanUpdate, onPanEnd]);

  useEffect(() => {
    if (grabbed) {
      hapticImpact('medium');
      Animated.spring(scale, { toValue: 1.04, useNativeDriver: true }).start();
    } else {
      Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      // Snap card back to origin after a drop or cancel.
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 9 }).start();
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9 }).start();
    }
  }, [grabbed]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(350)
        .onStart((e) => {
          cbRef.current.onLongPress(sessionId, e.absoluteY);
        })
        .onUpdate((e) => {
          translateX.setValue(e.translationX);
          translateY.setValue(e.translationY);
          cbRef.current.onPanUpdate(sessionId, e.translationY, e.absoluteY);
        })
        .onEnd((e) => {
          cbRef.current.onPanEnd(sessionId, e.translationY, e.absoluteY);
        }),
    [sessionId, translateX, translateY],
  );

  // Update enabled dynamically without recreating the gesture
  useEffect(() => { gesture.enabled(enabled); }, [enabled, gesture]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.card,
          session.isFocused && styles.focused,
          grabbed && styles.elevated,
          { transform: [{ translateX }, { translateY }, { scale }] },
        ]}
      >
        <View style={[styles.edge, { backgroundColor: MODALITY_COLOUR[session.modality] }]} />
        <View style={styles.body}>
          <VirraText variant="bodyMedium" size={14} color={colors.breath} numberOfLines={1}>
            {session.session_label}
          </VirraText>
          <View style={styles.meta}>
            <SymbolView name={MODALITY_ICON[session.modality]} size={11} tintColor={colors.muted} />
            <VirraText variant="mono" size={10} color={colors.muted}>
              {session.modality.toUpperCase()} · {session.estimated_minutes} MIN
            </VirraText>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

interface GhostProps {
  modality:      DraggableSession['modality'];
  session_label: string;
}

export function SessionCardGhost({ modality, session_label }: GhostProps) {
  return (
    <View style={[styles.card, styles.ghost]} pointerEvents="none">
      <View style={[styles.edge, { backgroundColor: MODALITY_COLOUR[modality] }]} />
      <View style={styles.body}>
        <VirraText variant="bodyMedium" size={14} color={colors.breath} numberOfLines={1}>
          {session_label}
        </VirraText>
        <View style={styles.meta}>
          <SymbolView name={MODALITY_ICON[modality]} size={11} tintColor={colors.muted} />
          <VirraText variant="mono" size={10} color={colors.muted}>
            {modality.toUpperCase()}
          </VirraText>
        </View>
      </View>
    </View>
  );
}

// Completed sessions are shown for context (so the day looks the same as in
// the calendar/list views) but can't be dragged; they're already done.
export function CompletedSessionCard({ modality, session_label }: GhostProps) {
  return (
    <View style={[styles.card, styles.done]} pointerEvents="none">
      <View style={[styles.edge, { backgroundColor: MODALITY_COLOUR[modality] }]} />
      <View style={styles.body}>
        <VirraText variant="bodyMedium" size={14} color={colors.breath} numberOfLines={1}>
          {session_label}
        </VirraText>
        <View style={styles.meta}>
          <SymbolView name="checkmark.circle.fill" size={11} tintColor={colors.pulse} />
          <VirraText variant="mono" size={10} color={colors.muted}>
            {modality.toUpperCase()} · DONE
          </VirraText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140, height: 52,
    backgroundColor: colors.mist,
    borderRadius: radius.md,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  edge:    { width: 4, height: '100%' },
  body:    { flex: 1, padding: spacing.sm, gap: 2, justifyContent: 'center' },
  meta:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  focused: { borderWidth: 2, borderColor: colors.pulse },
  done:    { opacity: 0.55 },
  elevated:{ shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 100 },
  ghost:   { opacity: 0.6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.pulse },
});
