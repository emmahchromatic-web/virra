import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SwapPickerSheet, type SwapTarget } from '@/components/ui/SwapPickerSheet';

const targets: SwapTarget[] = [
  { id: 'a', modality: 'run',      session_label: '5k easy' },
  { id: 'b', modality: 'strength', session_label: 'Lower body' },
];

describe('SwapPickerSheet', () => {
  it('returns null when visible is false', () => {
    const { queryByText } = render(
      <SwapPickerSheet
        visible={false}
        targetDateLabel="Tuesday"
        targets={targets}
        onSwap={() => {}}
        onAddAlongside={() => {}}
        onCancel={() => {}}
      />
    );
    expect(queryByText(/Swap with/i)).toBeNull();
  });

  it('lists one Swap option per target', () => {
    const { getByText } = render(
      <SwapPickerSheet
        visible={true}
        targetDateLabel="Tuesday"
        targets={targets}
        onSwap={() => {}}
        onAddAlongside={() => {}}
        onCancel={() => {}}
      />
    );
    expect(getByText(/Swap with 5k easy/i)).toBeTruthy();
    expect(getByText(/Swap with Lower body/i)).toBeTruthy();
  });

  it('calls onSwap with the chosen target id', () => {
    const onSwap = jest.fn();
    const { getByText } = render(
      <SwapPickerSheet
        visible={true}
        targetDateLabel="Tuesday"
        targets={targets}
        onSwap={onSwap}
        onAddAlongside={() => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.press(getByText(/Swap with Lower body/i));
    expect(onSwap).toHaveBeenCalledWith('b');
  });

  it('calls onAddAlongside when the add option is pressed', () => {
    const onAdd = jest.fn();
    const { getByText } = render(
      <SwapPickerSheet
        visible={true}
        targetDateLabel="Tuesday"
        targets={targets}
        onSwap={() => {}}
        onAddAlongside={onAdd}
        onCancel={() => {}}
      />
    );
    fireEvent.press(getByText(/Add alongside Tuesday/i));
    expect(onAdd).toHaveBeenCalled();
  });

  it('calls onCancel when cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <SwapPickerSheet
        visible={true}
        targetDateLabel="Tuesday"
        targets={targets}
        onSwap={() => {}}
        onAddAlongside={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.press(getByText(/Cancel/i));
    expect(onCancel).toHaveBeenCalled();
  });
});
