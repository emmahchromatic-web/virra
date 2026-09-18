import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { appAlert } from '@/components/ui/VirraAlert';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { useTodayStore } from '@/store/today';
import { useProGate } from '@/lib/pro';
import type { TodaysSession } from '@/lib/todaysSession';
import { sessionLabelText } from '@/lib/sessionLabels';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

const TAB_ICONS: Record<string, SymbolName> = {
  index:     'house',
  training:  'bolt',
  nutrition: 'fork.knife',
  recipes:   'book.closed',
};

const TAB_LABELS: Record<string, string> = {
  index:    'Dashboard',
  training: 'Training',
  nutrition:'Nutrition',
  recipes:  'Recipes',
};

const LEFT_TABS  = ['index', 'training'];
const RIGHT_TABS = ['nutrition', 'recipes'];

function TabButton({ route, routeIndex, state, navigation, dimmed }: {
  route: any; routeIndex: number; state: any; navigation: any; dimmed?: boolean;
}) {
  const focused = state.index === routeIndex;
  const icon    = TAB_ICONS[route.name];
  const label   = TAB_LABELS[route.name] ?? route.name;
  const color   = focused ? colors.pulse : colors.muted;
  return (
    <Pressable
      style={[styles.tab, dimmed && styles.tabDimmed]}
      onPress={() => navigation.navigate(route.name)}
      accessibilityRole="tab"
      accessibilityLabel={dimmed ? `${label}, part of Virra Pro` : label}
      accessibilityState={{ selected: focused }}
    >
      <SymbolView name={icon} size={22} tintColor={color} />
      <VirraText variant="label" size={10} color={color}>{label}</VirraText>
    </Pressable>
  );
}

function routeToSession(session: TodaysSession) {
  if (session.modality === 'run') {
    router.push(`/(app)/run?sessionId=${session.id}` as any);
  } else {
    router.push(`/(app)/workout-preview?sessionId=${session.id}` as any);
  }
}

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const todaySessions = useTodayStore((s) => s.todaySessions);
  // Card 298. The recipe book is Pro. With "Show Pro features" off the tab
  // is greyed out rather than removed: dropping it left three tabs around a
  // centred play button, which read as a broken bar. It still opens the
  // locked card, so it is never a dead control.
  const { isPro, showLocked } = useProGate();
  const dimRecipes = !isPro && !showLocked;
  const allRoutes = state.routes
    .map((route: any, routeIndex: number) => ({ route, routeIndex }))
    .filter(({ route }: any) => route.name in TAB_ICONS);

  const left  = allRoutes.filter(({ route }: any) => LEFT_TABS.includes(route.name));
  const right = allRoutes.filter(({ route }: any) => RIGHT_TABS.includes(route.name));

  return (
    <View style={styles.bar}>
      {/* Each side is its own half so the play button stays dead centre
          whatever the tab count: the free tier can drop Recipes (card 298). */}
      <View style={styles.side}>
        {left.map(({ route, routeIndex }: any) => (
          <TabButton key={route.key} route={route} routeIndex={routeIndex} state={state} navigation={navigation} />
        ))}
      </View>

      {/* Centre FAB: routes by today's planned session modality */}
      <View style={styles.fabWrap}>
        <Pressable
          onPress={() => {
            const planned = todaySessions.filter(s => s.status === 'planned');
            if (planned.length === 0) {
              router.push('/(app)/run' as any);
            } else if (planned.length === 1) {
              routeToSession(planned[0]);
            } else {
              // Branded chooser rather than ActionSheetIOS. Card 206.
              appAlert(
                'Which session?',
                'You have more than one planned today.',
                [
                  ...planned.map((s) => ({
                    text: `${sessionLabelText(s.session_label)} · ${s.modality.toUpperCase()}`,
                    onPress: () => routeToSession(s),
                  })),
                  { text: 'Cancel', style: 'cancel' as const },
                ],
              );
            }
          }}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Start session"
        >
          <SymbolView name="play.fill" size={24} tintColor={colors.mile} />
        </Pressable>
      </View>

      <View style={styles.side}>
        {right.map(({ route, routeIndex }: any) => (
          <TabButton
            key={route.key}
            route={route}
            routeIndex={routeIndex}
            state={state}
            navigation={navigation}
            dimmed={dimRecipes && route.name === 'recipes'}
          />
        ))}
      </View>
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
  side: {
    flex:          2,
    flexDirection: 'row',
  },
  tabDimmed: { opacity: 0.3 },
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
