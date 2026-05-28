import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors } from '@/constants/theme';
import { VirraText } from './VirraText';
import type { DayState, Modality } from '@/lib/dayState';

const MODALITY_ICON: Record<Modality, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'figure.mixed.cardio',
};

const MODALITY_COLOR: Record<Modality, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

interface DayCellProps {
  state:     DayState;
  isToday:   boolean;
  dayLetter: string;
  belowSlot?: React.ReactNode;
}

export function DayCell({ state, isToday, dayLetter, belowSlot }: DayCellProps) {
  return (
    <View style={cell.col}>
      <VirraText
        variant="mono"
        size={10}
        color={isToday ? colors.breath : colors.muted}
      >
        {dayLetter}
      </VirraText>
      <View style={cell.slot}>{renderInner(state)}</View>
      {belowSlot}
    </View>
  );
}

function renderInner(state: DayState): React.ReactNode {
  switch (state.kind) {
    case 'rest':
      return null;

    case 'planned': {
      const color = MODALITY_COLOR[state.modality];
      return (
        <View style={[cell.circle, { borderColor: colors.border }]}>
          <SymbolView name={MODALITY_ICON[state.modality]} size={12} tintColor={color} />
        </View>
      );
    }

    case 'completed':
      return (
        <View style={[cell.circle, {
          backgroundColor: MODALITY_COLOR[state.modality],
          borderColor:     MODALITY_COLOR[state.modality],
        }]}>
          <SymbolView name={MODALITY_ICON[state.modality]} size={12} tintColor={colors.mile} />
        </View>
      );

    case 'planned_multi':
      return (
        <View style={[cell.circle, cell.plannedMulti, { borderColor: colors.border }]}>
          <SymbolView name={MODALITY_ICON[state.a]} size={11} tintColor={MODALITY_COLOR[state.a]} />
          <SymbolView name={MODALITY_ICON[state.b]} size={11} tintColor={MODALITY_COLOR[state.b]} />
        </View>
      );

    case 'completed_multi':
      return (
        <View style={cell.circle}>
          <View style={[cell.half, cell.halfLeft,  { backgroundColor: MODALITY_COLOR[state.a] }]}>
            <SymbolView name={MODALITY_ICON[state.a]} size={11} tintColor={colors.mile} />
          </View>
          <View style={[cell.half, cell.halfRight, { backgroundColor: MODALITY_COLOR[state.b] }]}>
            <SymbolView name={MODALITY_ICON[state.b]} size={11} tintColor={colors.mile} />
          </View>
        </View>
      );

    case 'missed':
      return (
        <View style={[cell.circle, { borderColor: colors.border }]}>
          <View style={cell.missedBar} />
        </View>
      );

    case 'mixed':
      return (
        <View style={cell.circle}>
          <View style={[cell.half, cell.halfLeft,  { backgroundColor: MODALITY_COLOR[state.completed] }]} />
          <View style={[cell.half, cell.halfRight, cell.halfBordered]}>
            <View style={cell.missedBar} />
          </View>
        </View>
      );
  }
}

const CIRCLE = 32;

const cell = StyleSheet.create({
  col:  { alignItems: 'center', gap: 4, flex: 1 },
  slot: { width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexDirection: 'row',
  },
  half: {
    width: CIRCLE / 2, height: CIRCLE,
    alignItems: 'center', justifyContent: 'center',
  },
  halfLeft:  {
    borderTopLeftRadius: CIRCLE / 2, borderBottomLeftRadius: CIRCLE / 2,
  },
  halfRight: {
    borderTopRightRadius: CIRCLE / 2, borderBottomRightRadius: CIRCLE / 2,
  },
  halfBordered: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent',
  },
  plannedMulti: { gap: 3 },
  missedBar: {
    width: 10, height: 2, borderRadius: 1, backgroundColor: colors.muted,
  },
});
