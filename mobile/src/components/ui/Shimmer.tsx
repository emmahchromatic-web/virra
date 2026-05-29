import React, { useEffect, useRef, useState } from 'react';
import {
  View, Animated, Easing, StyleSheet, AccessibilityInfo,
  type LayoutChangeEvent, type ViewStyle, type StyleProp,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, radius as themeRadius, spacing } from '@/constants/theme';

interface ShimmerProps {
  /** Height of each bar, in px. Required. */
  height: number;
  /** Fixed width in px. Omit to fill the container (measured via onLayout). */
  width?: number;
  /** Corner radius of each bar. Defaults to radius.sm. */
  borderRadius?: number;
  /** Number of stacked bars. The last bar of a multi-line block is shortened. Defaults to 1. */
  lines?: number;
  /** Outer container style override. */
  style?: StyleProp<ViewStyle>;
}

const SWEEP_DURATION_MS = 1100;
// Base skeleton fill: colors.mist (#1C1C24) lifted slightly so the bar reads as a
// placeholder above the card surface even when the sweep is off (reduced motion).
const BASE_COLOR = '#26262F';

export function Shimmer({ height, width, borderRadius = themeRadius.sm, lines = 1, style }: ShimmerProps) {
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(width ?? null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  // Honour the OS "Reduce Motion" accessibility setting.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(v));
    return () => { mounted = false; sub.remove(); };
  }, []);

  // Drive the horizontal sweep once we know the width and motion is allowed.
  useEffect(() => {
    if (reduceMotion || measuredWidth == null) return;
    translateX.setValue(-measuredWidth);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: measuredWidth,
        duration: SWEEP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, measuredWidth, translateX]);

  function onLayout(e: LayoutChangeEvent) {
    if (width == null) setMeasuredWidth(e.nativeEvent.layout.width);
  }

  const count = Math.max(1, lines);
  const barWidths = Array.from({ length: count }, (_, i) =>
    count > 1 && i === count - 1 ? ('60%' as const) : ('100%' as const),
  );

  return (
    <View style={[s.container, style]} onLayout={onLayout} testID="shimmer">
      {barWidths.map((w, i) => (
        <View
          key={i}
          testID="shimmer-bar"
          style={{ width: w, height, borderRadius, backgroundColor: BASE_COLOR, overflow: 'hidden' }}
        >
          {!reduceMotion && measuredWidth != null && (
            <Animated.View
              testID="shimmer-sweep"
              style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
            >
              <Svg width={measuredWidth} height={height}>
                <Defs>
                  <LinearGradient id="shimmerGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={colors.breath} stopOpacity="0" />
                    <Stop offset="0.5" stopColor={colors.breath} stopOpacity="0.12" />
                    <Stop offset="1" stopColor={colors.breath} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width={measuredWidth} height={height} fill="url(#shimmerGrad)" />
              </Svg>
            </Animated.View>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: spacing.xs },
});
