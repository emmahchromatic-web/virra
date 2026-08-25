import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TodaysSessionHero } from '@/components/ui/TodaysSessionHero';
import type { TodaysSession } from '@/lib/todaysSession';

const base: Omit<TodaysSession, 'id' | 'modality' | 'session_label'> = {
  status:                   'planned',
  activity_id:              null,
  cycle_adjusted_pace_secs: null,
  cycle_reason_short:       null,
  cycle_pace_arrow:         null,
  structure_summary:        null,
};

const runSession: TodaysSession      = { ...base, id: 'r1', modality: 'run',      session_label: 'Easy Run'   };
const strengthSession: TodaysSession = { ...base, id: 's1', modality: 'strength', session_label: 'Lower Body' };

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The chooser is the branded dialog now, not ActionSheetIOS (card 206), so the
// assertion is on what appAlert was handed rather than on a native sheet.
const mockAppAlert = jest.fn();
jest.mock('@/components/ui/VirraAlert', () => ({
  appAlert: (...args: any[]) => mockAppAlert(...args),
  VirraAlertHost: () => null,
}));

beforeEach(() => mockAppAlert.mockClear());

/** Press the nth non-cancel option of the last branded dialog shown. */
function chooseOption(index: number) {
  const buttons = mockAppAlert.mock.calls[0][2];
  buttons[index].onPress();
}

describe('TodaysSessionHero', () => {
  it('calls onStartPress immediately when exactly one planned session', () => {
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(runSession);
  });

  it('offers a branded chooser when multiple planned sessions exist', () => {
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));

    expect(mockAppAlert).toHaveBeenCalledTimes(1);
    const buttons = mockAppAlert.mock.calls[0][2];
    // One button per session, plus Cancel last.
    expect(buttons).toHaveLength(3);
    expect(buttons[buttons.length - 1].text).toBe('Cancel');
    expect(buttons[buttons.length - 1].style).toBe('cancel');

    chooseOption(0);
    expect(handler).toHaveBeenCalledWith(runSession);
  });

  it('starts the session the user actually picked, not the first one', () => {
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    chooseOption(1);
    expect(handler).toHaveBeenCalledWith(strengthSession);
  });

  it('does nothing when cancel is chosen', () => {
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    const buttons = mockAppAlert.mock.calls[0][2];
    expect(buttons[buttons.length - 1].onPress).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('labels button START RUN for a single planned run', () => {
    const { getByText } = render(
      <TodaysSessionHero sessions={[runSession]} onStartPress={() => {}} />,
    );
    expect(getByText('START RUN')).toBeTruthy();
  });

  it('labels button START SESSION for a single planned non-run', () => {
    const { getByText } = render(
      <TodaysSessionHero sessions={[strengthSession]} onStartPress={() => {}} />,
    );
    expect(getByText('START SESSION')).toBeTruthy();
  });

  it('labels button START SESSION → for multiple planned sessions', () => {
    const { getByText } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={() => {}} />,
    );
    expect(getByText('START SESSION →')).toBeTruthy();
  });

  it('hides the button when no planned sessions remain', () => {
    const done: TodaysSession = { ...runSession, status: 'completed' };
    const { queryByRole } = render(
      <TodaysSessionHero sessions={[done]} onStartPress={() => {}} />,
    );
    expect(queryByRole('button', { name: /start/i })).toBeNull();
  });
});
