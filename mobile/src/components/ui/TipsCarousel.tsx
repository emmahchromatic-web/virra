import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { SectionLabel } from './SectionLabel';
import { Shimmer } from './Shimmer';
import type { CyclePhase } from '@/lib/cycleEngine';

interface Tip {
  id:       string;
  phase:    string;
  category: string;
  tip_text: string;
}

const CARD_WIDTH = Dimensions.get('window').width * 0.58;

// Stepped fade overlay simulating a gradient from transparent → card bg (colors.mist = #1C1C24)
const FADE_STEPS = [0, 0.05, 0.14, 0.3, 0.54, 0.78, 1] as const;

const CATEGORY_COLOR: Record<string, string> = {
  training:  colors.pulse,
  nutrition: colors.dawn,
  lifestyle: colors.breath,
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Props {
  phase: CyclePhase | null;
}

export function TipsCarousel({ phase }: Props) {
  const [tips,      setTips]      = useState<Tip[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [scrolled,  setScrolled]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const phases = phase ? [phase, 'all'] : ['all'];
    const { data } = await supabase
      .from('tips')
      .select('id, phase, category, tip_text')
      .in('phase', phases)
      .order('sort_order', { ascending: true });
    setTips(shuffle((data ?? []) as Tip[]));
    setLoading(false);
  }, [phase]);

  useEffect(() => { load(); }, [load]);

  return (
    <VirraCard style={styles.card}>
      <SectionLabel style={styles.kicker}>PHASE TIPS</SectionLabel>
      {loading ? (
        <Shimmer height={72} lines={1} />
      ) : (
        <View style={styles.scrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            scrollEventThrottle={16}
            onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.x > 0)}
          >
            {tips.map((tip) => (
              <View key={tip.id} style={styles.tip}>
                <VirraText
                  variant="mono"
                  size={7}
                  color={CATEGORY_COLOR[tip.category] ?? colors.muted}
                  style={styles.cat}
                >
                  {tip.category.toUpperCase()} · {tip.phase === 'all' ? 'ALL PHASES' : tip.phase.toUpperCase()}
                </VirraText>
                <VirraText variant="body" size={13} color={colors.breath} style={styles.text}>
                  {tip.tip_text}
                </VirraText>
              </View>
            ))}
          </ScrollView>
          {scrolled && (
            <View style={styles.fadeLeft} pointerEvents="none">
              {[...FADE_STEPS].reverse().map((opacity, i) => (
                <View key={i} style={[styles.fadeSlice, { backgroundColor: `rgba(28,28,36,${opacity})` }]} />
              ))}
            </View>
          )}
          <View style={styles.fadeRight} pointerEvents="none">
            {FADE_STEPS.map((opacity, i) => (
              <View key={i} style={[styles.fadeSlice, { backgroundColor: `rgba(28,28,36,${opacity})` }]} />
            ))}
          </View>
        </View>
      )}
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:      { gap: spacing.xs },
  kicker:    { letterSpacing: 1.5 },
  scrollWrap: { position: 'relative' },
  scroll:    { gap: spacing.sm, paddingRight: spacing.lg },
  fadeLeft: {
    position:      'absolute',
    left:          0,
    top:           0,
    bottom:        0,
    width:         40,
    flexDirection: 'row',
  },
  fadeRight: {
    position:      'absolute',
    right:         0,
    top:           0,
    bottom:        0,
    width:         40,
    flexDirection: 'row',
  },
  fadeSlice: { flex: 1 },
  tip:    {
    width:           CARD_WIDTH,
    backgroundColor: 'rgba(10,10,15,0.6)',
    borderRadius:    radius.md,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    gap:             spacing.xs,
  },
  cat:    { letterSpacing: 1.5 },
  text:   { lineHeight: 19 },
});
