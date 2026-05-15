/**
 * Separate test file for moveSession so the top-level jest.mock('@/lib/supabase')
 * doesn't interfere with the pure-function tests in scheduleGenerator.test.ts.
 */

const captured: { insertPayload: any } = { insertPayload: null };

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          week_number:        2,
          modality:           'run',
          session_label:      'tempo',
          block_id:           'b1',
          run_structure:      { version: 1, workout_type: 'tempo', total_distance_m: 8000, steps: [] },
          strength_structure: null,
        },
        error: null,
      }),
      insert: jest.fn((payload: any) => {
        captured.insertPayload = payload;
        return {
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
        };
      }),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

import { moveSession } from '@/lib/scheduleGenerator';

describe('moveSession preserves workout structure', () => {
  test('insert payload includes run_structure from origin row', async () => {
    await moveSession('orig-id', '2026-05-20', 'user-id');
    expect(captured.insertPayload.run_structure).toBeDefined();
    expect(captured.insertPayload.run_structure.workout_type).toBe('tempo');
  });
});
