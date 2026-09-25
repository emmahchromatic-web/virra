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

// Card 319. The rows were inert: the pill and the name looked like a link and
// were not one, and the Training tab passed no callbacks at all, so nothing in
// its list could be opened by any means.
describe('opening a session by tapping its row', () => {
  it('opens the session that was tapped, not the first planned one', () => {
    const onOpenSession = jest.fn();
    const { getByLabelText } = render(
      <TodaysSessionHero
        sessions={[runSession, strengthSession]}
        onOpenSession={onOpenSession}
      />,
    );

    fireEvent.press(getByLabelText('Open Lower Body'));
    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(onOpenSession).toHaveBeenCalledWith(strengthSession);
  });

  it('says VIEW rather than OPEN for a session already done', () => {
    const onOpenSession = jest.fn();
    const done: TodaysSession = { ...runSession, status: 'completed', activity_id: 'act-1' };
    const { getByLabelText } = render(
      <TodaysSessionHero sessions={[done]} onOpenSession={onOpenSession} />,
    );

    fireEvent.press(getByLabelText('View Easy Run'));
    expect(onOpenSession).toHaveBeenCalledWith(done);
  });

  it('stays inert when no handler is given, rather than looking tappable', () => {
    const { queryByLabelText } = render(<TodaysSessionHero sessions={[runSession]} />);
    expect(queryByLabelText('Open Easy Run')).toBeNull();
  });

  it('does not confuse a row press with the start button', () => {
    // The start button filters to planned sessions and asks which one when
    // there are several; a row press already knows which session it is.
    const onOpenSession = jest.fn();
    const onStartPress  = jest.fn();
    const { getByLabelText } = render(
      <TodaysSessionHero
        sessions={[runSession, strengthSession]}
        onOpenSession={onOpenSession}
        onStartPress={onStartPress}
      />,
    );

    fireEvent.press(getByLabelText('Open Easy Run'));
    expect(onStartPress).not.toHaveBeenCalled();
    expect(mockAppAlert).not.toHaveBeenCalled();
  });
});
