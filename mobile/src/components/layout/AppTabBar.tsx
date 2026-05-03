import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

const TAB_ICONS: Record<string, string> = {
  index:    '⌂',
  training: '⚡',
  nutrition:'◎',
  library:  '▦',
};

const TAB_LABELS: Record<string, string> = {
  index:    'Dashboard',
  training: 'Training',
  nutrition:'Nutrition',
  library:  'Library',
};

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bar}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const icon    = TAB_ICONS[route.name]  ?? '·';
        const label   = TAB_LABELS[route.name] ?? route.name;

        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => navigation.navigate(route.name)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
          >
            <VirraText size={22} color={focused ? colors.pulse : colors.muted}>
              {icon}
            </VirraText>
            <VirraText variant="label" size={8} color={focused ? colors.pulse : colors.muted}>
              {label}
            </VirraText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:   'row',
    backgroundColor: colors.mist,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    paddingBottom:   spacing.lg,
    paddingTop:      spacing.sm,
  },
  tab: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            2,
  },
});
