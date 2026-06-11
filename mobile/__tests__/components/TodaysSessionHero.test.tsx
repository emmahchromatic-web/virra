import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ActionSheetIOS } from 'react-native';
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

  it('shows ActionSheet when multiple planned sessions exist', () => {
    const showSheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((opts, cb) => cb(0));
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    expect(showSheet).toHaveBeenCalledTimes(1);
    // Assert cancel is the last option and cancelButtonIndex is set correctly
    const callOpts = showSheet.mock.calls[0][0];
    expect(callOpts.cancelButtonIndex).toBe(callOpts.options.length - 1);
    expect(callOpts.options[callOpts.options.length - 1]).toBe('Cancel');
    // cb(0) selects first option → runSession
    expect(handler).toHaveBeenCalledWith(runSession);
    showSheet.mockRestore();
  });

  it('does not call handler when ActionSheet cancel is chosen', () => {
    const showSheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((opts, cb) => {
        cb(opts.options.length - 1);
      });
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    expect(handler).not.toHaveBeenCalled();
    showSheet.mockRestore();
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
