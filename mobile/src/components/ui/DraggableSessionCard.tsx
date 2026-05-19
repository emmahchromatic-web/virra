import React, { useRef, useEffect } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  LongPressGestureHandler,
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
  type PanGestureHandlerGestureEvent,
  type LongPressGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

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
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!grabbed) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(scale,      { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.spring(scale, { toValue: 1.05, useNativeDriver: true }).start();
    }
  }, [grabbed]);

  function handleLongPressStateChange(e: LongPressGestureHandlerStateChangeEvent) {
    if (e.nativeEvent.state === State.ACTIVE) {
      onLongPress(session.id, e.nativeEvent.absoluteY);
    }
  }

  function handlePanEvent(e: PanGestureHandlerGestureEvent) {
    if (!grabbed) return;
    translateX.setValue(e.nativeEvent.translationX);
    translateY.setValue(e.nativeEvent.translationY);
    onPanUpdate(session.id, e.nativeEvent.translationY, e.nativeEvent.absoluteY);
  }

  function handlePanStateChange(e: PanGestureHandlerStateChangeEvent) {
    if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
      if (grabbed) {
        onPanEnd(session.id, e.nativeEvent.translationY, e.nativeEvent.absoluteY);
      }
    }
  }

  return (
    <LongPressGestureHandler
      minDurationMs={400}
      onHandlerStateChange={handleLongPressStateChange}
      enabled={enabled}
    >
      <Animated.View>
        <PanGestureHandler
          onGestureEvent={handlePanEvent}
          onHandlerStateChange={handlePanStateChange}
          enabled={enabled && grabbed}
        >
          <Animated.View
            style={[
              styles.card,
              session.isFocused && styles.focused,
              { transform: [{ translateX }, { translateY }, { scale }] },
              grabbed && styles.elevated,
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
        </PanGestureHandler>
      </Animated.View>
    </LongPressGestureHandler>
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
  elevated:{ shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 100 },
});
