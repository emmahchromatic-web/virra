import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

const TAB_ICONS: Record<string, SymbolName> = {
  index:     'house',
  training:  'bolt',
  nutrition: 'fork.knife',
  library:   'books.vertical',
};

const TAB_LABELS: Record<string, string> = {
  index:    'Dashboard',
  training: 'Training',
  nutrition:'Nutrition',
  library:  'Library',
};

const LEFT_TABS  = ['index', 'training'];
const RIGHT_TABS = ['nutrition', 'library'];

function TabButton({ route, routeIndex, state, navigation }: {
  route: any; routeIndex: number; state: any; navigation: any;
}) {
  const focused = state.index === routeIndex;
  const icon    = TAB_ICONS[route.name];
  const label   = TAB_LABELS[route.name] ?? route.name;
  const color   = focused ? colors.pulse : colors.muted;
  return (
    <Pressable
      style={styles.tab}
      onPress={() => navigation.navigate(route.name)}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <SymbolView name={icon} size={22} tintColor={color} />
      <VirraText variant="label" size={10} color={color}>{label}</VirraText>
    </Pressable>
  );
}

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const allRoutes = state.routes
    .map((route: any, routeIndex: number) => ({ route, routeIndex }))
    .filter(({ route }: any) => route.name in TAB_ICONS);

  const left  = allRoutes.filter(({ route }: any) => LEFT_TABS.includes(route.name));
  const right = allRoutes.filter(({ route }: any) => RIGHT_TABS.includes(route.name));

  return (
    <View style={styles.bar}>
      {left.map(({ route, routeIndex }: any) => (
        <TabButton key={route.key} route={route} routeIndex={routeIndex} state={state} navigation={navigation} />
      ))}

      {/* Centre run FAB */}
      <View style={styles.fabWrap}>
        <Pressable
          onPress={() => router.push('/(app)/run' as any)}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Start run"
        >
          <SymbolView name="play.fill" size={24} tintColor={colors.mile} />
        </Pressable>
      </View>

      {right.map(({ route, routeIndex }: any) => (
        <TabButton key={route.key} route={route} routeIndex={routeIndex} state={state} navigation={navigation} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:   'row',
    alignItems:      'center',
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
  fabWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  fab: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: colors.pulse,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     colors.pulse,
    shadowOpacity:   0.45,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 4 },
  },
});
