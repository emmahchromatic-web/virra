import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('@/components/layout/AppHeader', () => ({
  AppHeader: ({ title }: any) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

import RecipesScreen from '@/app/(app)/(tabs)/recipes';
import { AppTabBar } from '@/components/layout/AppTabBar';

describe('Recipes holding page', () => {
  it('is headed Recipes and says it is coming', () => {
    const { getByText, queryByText } = render(<RecipesScreen />);
    expect(getByText('Recipes')).toBeTruthy();
    expect(getByText('COMING SOON')).toBeTruthy();
    expect(queryByText(/Nutrition tab/)).toBeTruthy();   // points somewhere useful meanwhile
  });

  it('carries no em-dashes, per the copy rule', () => {
    const { toJSON } = render(<RecipesScreen />);
    expect(JSON.stringify(toJSON())).not.toMatch(/—/);
  });
});

describe('the tab bar', () => {
  // The route was renamed from 'library', so the label map has to follow it or
  // the tab silently falls back to showing its raw route name.
  const state = {
    index: 0,
    routes: [
      { key: 'index-1',     name: 'index' },
      { key: 'training-1',  name: 'training' },
      { key: 'nutrition-1', name: 'nutrition' },
      { key: 'recipes-1',   name: 'recipes' },
    ],
  };

  it('labels the fourth tab Recipes, not Library or the bare route name', () => {
    const { getByText, queryByText } = render(
      <AppTabBar state={state as any} navigation={{ navigate: jest.fn() } as any} descriptors={{} as any} insets={{} as any} />,
    );
    expect(getByText('Recipes')).toBeTruthy();
    expect(queryByText('Library')).toBeNull();
    expect(queryByText('recipes')).toBeNull();
  });
});
