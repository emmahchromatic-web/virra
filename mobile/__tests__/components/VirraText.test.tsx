import React from 'react';
import { render } from '@testing-library/react-native';
import { VirraText } from '@/components/ui/VirraText';

describe('VirraText', () => {
  it('renders children', () => {
    const { getByText } = render(<VirraText>Hello</VirraText>);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('applies display font for variant="display"', () => {
    const { getByText } = render(
      <VirraText variant="display">BIG</VirraText>
    );
    const el = getByText('BIG');
    expect(el.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: 'BigShouldersDisplay_900Black' }),
      ])
    );
  });

  it('applies mono font for variant="mono"', () => {
    const { getByText } = render(
      <VirraText variant="mono">CODE</VirraText>
    );
    const el = getByText('CODE');
    expect(el.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: 'SpaceMono_400Regular' }),
      ])
    );
  });
});
