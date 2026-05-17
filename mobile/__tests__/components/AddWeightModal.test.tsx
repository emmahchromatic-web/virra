import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AddWeightModal } from '@/components/ui/AddWeightModal';

jest.mock('@/lib/supabase', () => {
  const insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: { from: jest.fn(() => ({ insert })) },
    __insert: insert,
  };
});

jest.mock('@/lib/weightBaseline', () => ({
  computeBaseline: jest.fn().mockResolvedValue(60.5),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: { getState: () => ({ periodStart: new Date('2025-01-01'), cycleLength: 28 }) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baselineMock = require('@/lib/weightBaseline');

describe('AddWeightModal', () => {
  beforeEach(() => {
    supabaseMock.__insert.mockClear();
    baselineMock.computeBaseline.mockClear();
  });

  it('renders nothing when visible is false', () => {
    const { queryByText } = render(
      <AddWeightModal visible={false} userId="u" onClose={() => {}} />
    );
    expect(queryByText(/Save/i)).toBeNull();
  });

  it('inserts a row and calls computeBaseline on Save', async () => {
    const onClose = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <AddWeightModal visible={true} userId="u" onClose={onClose} />
    );
    fireEvent.changeText(getByPlaceholderText('kg'), '60.5');
    fireEvent.press(getByText(/Save/i));
    await waitFor(() => expect(supabaseMock.__insert).toHaveBeenCalled());
    const [[row]] = supabaseMock.__insert.mock.calls;
    expect(row.user_id).toBe('u');
    expect(row.weight_kg).toBeCloseTo(60.5);
    expect(row.source).toBe('manual');
    expect(baselineMock.computeBaseline).toHaveBeenCalledWith('u');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not insert when the input is invalid', () => {
    const { getByPlaceholderText, getByText } = render(
      <AddWeightModal visible={true} userId="u" onClose={() => {}} />
    );
    fireEvent.changeText(getByPlaceholderText('kg'), '');
    fireEvent.press(getByText(/Save/i));
    expect(supabaseMock.__insert).not.toHaveBeenCalled();
  });
});
