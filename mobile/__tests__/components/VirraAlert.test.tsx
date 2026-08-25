import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

import { VirraAlertHost, appAlert, appPrompt } from '@/components/ui/VirraAlert';

describe('VirraAlertHost', () => {
  it('renders nothing until something is shown', () => {
    const { toJSON } = render(<VirraAlertHost />);
    expect(toJSON()).toBeNull();
  });

  it('shows an alert and runs the pressed button, then dismisses', async () => {
    const onPress = jest.fn();
    const { findByText, queryByText } = render(<VirraAlertHost />);

    appAlert('Delete this?', 'It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress },
    ]);

    expect(await findByText('DELETE THIS?')).toBeTruthy();
    expect(queryByText('It cannot be undone.')).toBeTruthy();

    fireEvent.press(await findByText('DELETE'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(queryByText('DELETE THIS?')).toBeNull());
  });

  it('falls back to a single OK when no buttons are given', async () => {
    const { findByText } = render(<VirraAlertHost />);
    appAlert('Saved');
    expect(await findByText('OK')).toBeTruthy();
  });

  describe('appPrompt', () => {
    it('submits the trimmed value', async () => {
      const onSubmit = jest.fn();
      const { findByText, getByLabelText, queryByText } = render(<VirraAlertHost />);

      appPrompt('Save as meal', 'Give this combination a name', {
        placeholder: 'e.g. Post-run porridge',
        submitText:  'Save',
        onSubmit,
      });

      await findByText('SAVE AS MEAL');
      fireEvent.changeText(getByLabelText('e.g. Post-run porridge'), '  Porridge  ');
      fireEvent.press(await findByText('SAVE'));

      expect(onSubmit).toHaveBeenCalledWith('Porridge');
      await waitFor(() => expect(queryByText('SAVE AS MEAL')).toBeNull());
    });

    it('will not submit an empty or whitespace-only value', async () => {
      const onSubmit = jest.fn();
      const { findByText, getByLabelText } = render(<VirraAlertHost />);

      appPrompt('Save as meal', undefined, { placeholder: 'Name', onSubmit });
      await findByText('SAVE AS MEAL');

      fireEvent.press(await findByText('SAVE'));          // nothing typed yet
      fireEvent.changeText(getByLabelText('Name'), '   '); // whitespace only
      fireEvent.press(await findByText('SAVE'));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not carry a previous answer into the next prompt', async () => {
      const first = jest.fn(), second = jest.fn();
      const { findByText, getByLabelText } = render(<VirraAlertHost />);

      appPrompt('First', undefined, { placeholder: 'Name', onSubmit: first });
      await findByText('FIRST');
      fireEvent.changeText(getByLabelText('Name'), 'Porridge');
      fireEvent.press(await findByText('SAVE'));
      expect(first).toHaveBeenCalledWith('Porridge');

      appPrompt('Second', undefined, { placeholder: 'Name', onSubmit: second });
      await findByText('SECOND');
      fireEvent.press(await findByText('SAVE'));   // field should be empty again
      expect(second).not.toHaveBeenCalled();
    });
  });
  // Screens presented with `presentation: 'modal'` mount their own host,
  // because the root host draws in a native RN Modal and iOS refuses to
  // present a second modal from a view controller that already has one up.
  // Two hosts must never both draw the same alert, and the deeper one wins.
  describe('stacking', () => {
    it('renders in the host that mounted last, not the root one', async () => {
      const root = render(<VirraAlertHost />);
      const modalScreen = render(<VirraAlertHost />);

      appAlert('Could not add food');

      expect(await modalScreen.findByText('COULD NOT ADD FOOD')).toBeTruthy();
      expect(root.queryByText('COULD NOT ADD FOOD')).toBeNull();
    });

    it('hands rendering back to the root host once the modal screen unmounts', async () => {
      const root = render(<VirraAlertHost />);
      const modalScreen = render(<VirraAlertHost />);
      modalScreen.unmount();

      appAlert('Could not add food');

      expect(await root.findByText('COULD NOT ADD FOOD')).toBeTruthy();
    });
  });
});
