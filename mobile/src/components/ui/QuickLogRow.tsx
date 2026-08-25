import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  trackWeight:     boolean;
  onFoodPress:     () => void;
  onActivityPress: () => void;
  onWeightPress:   () => void;
}

interface TileProps {
  symbol:             import('expo-symbols').SymbolViewProps['name'];
  label:              string;
  accessibilityLabel: string;
  onPress:            () => void;
}

function LogTile({ symbol, label, accessibilityLabel, onPress }: TileProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <SymbolView name={symbol} size={20} tintColor={colors.muted} />
      <VirraText variant="mono" size={7} color={colors.muted} style={styles.label}>{label}</VirraText>
    </Pressable>
  );
}

export function QuickLogRow({ trackWeight, onFoodPress, onActivityPress, onWeightPress }: Props) {
  return (
    <View style={styles.row}>
      <LogTile symbol="fork.knife"  label="FOOD"     accessibilityLabel="Log food"     onPress={onFoodPress}     />
      <LogTile symbol="bolt.fill"   label="ACTIVITY" accessibilityLabel="Log activity" onPress={onActivityPress} />
      {trackWeight && (
        <LogTile symbol="scalemass" label="WEIGHT"   accessibilityLabel="Log weight"   onPress={onWeightPress}   />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:         { flexDirection: 'row', gap: spacing.sm },
  tile:        {
    flex:            1,
    backgroundColor: 'rgba(244,237,224,0.04)',
    borderWidth:     1,
    borderColor:     colors.control,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    gap:             spacing.xs,
  },
  tilePressed: { opacity: 0.7 },
  label:       { letterSpacing: 1 },
});
