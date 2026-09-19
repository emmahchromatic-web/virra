const mockUpsert = jest.fn();

const mockFrom = jest.fn((table: string) => {
  if (table === 'symptom_logs') return { upsert: mockUpsert };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleCheckIn } from '@/lib/outbox/handlers/checkIn';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
});

const payload: MutationPayloadMap['checkIn'] = {
  user_id:       'u1',
  recorded_on:   '2026-09-19',
  energy:        4,
  mood:          3,
  sleep_quality: 5,
  symptoms:      ['Cramps', 'Fatigue'],
  notes:         'felt okay',
};

describe('handleCheckIn', () => {
  it('upserts the check-in onto symptom_logs, keyed on user_id + recorded_on', async () => {
    await handleCheckIn(payload);

    expect(mockFrom).toHaveBeenCalledWith('symptom_logs');
    expect(mockUpsert).toHaveBeenCalledWith(payload, { onConflict: 'user_id,recorded_on' });
  });

  it('resolves with no return value on success', async () => {
    await expect(handleCheckIn(payload)).resolves.toBeUndefined();
  });

  it('throws a SupabaseWriteError carrying status/code/message when the upsert fails', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'boom', code: '23505' }, status: 409,
    });

    const err = await handleCheckIn(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('23505');
    expect(err.message).toBe('boom');
  });
});
