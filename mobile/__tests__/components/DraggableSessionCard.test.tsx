import React from 'react';
import { render } from '@testing-library/react-native';
import { DraggableSessionCard } from '@/components/ui/DraggableSessionCard';

const session = {
  id: '1',
  modality: 'run' as const,
  session_label: '5k easy',
  estimated_minutes: 30,
  isFocused: true,
};

describe('DraggableSessionCard', () => {
  it('renders the session label and duration', () => {
    const { getByText } = render(
      <DraggableSessionCard
        session={session}
        onLongPress={() => {}}
        onPanUpdate={() => {}}
        onPanEnd={() => {}}
        grabbed={false}
        enabled
      />
    );
    expect(getByText(/5k easy/i)).toBeTruthy();
    expect(getByText(/30 MIN/i)).toBeTruthy();
  });

  it('renders the modality kicker', () => {
    const { getByText } = render(
      <DraggableSessionCard
        session={session}
        onLongPress={() => {}}
        onPanUpdate={() => {}}
        onPanEnd={() => {}}
        grabbed={false}
        enabled
      />
    );
    expect(getByText(/RUN/i)).toBeTruthy();
  });

  it('renders without crashing when grabbed is true', () => {
    const { toJSON } = render(
      <DraggableSessionCard
        session={session}
        onLongPress={() => {}}
        onPanUpdate={() => {}}
        onPanEnd={() => {}}
        grabbed={true}
        enabled
      />
    );
    expect(toJSON()).toBeTruthy();
  });
});
