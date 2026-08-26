import { scrubSensitiveData } from '@/lib/sentry';

describe('scrubSensitiveData', () => {
  it('redacts known cycle/health fields', () => {
    const input = { period_start: '2026-08-01', cycle_length_days: 28, user_id: 'abc' };
    expect(scrubSensitiveData(input)).toEqual({
      period_start: '[redacted]',
      cycle_length_days: '[redacted]',
      user_id: 'abc',
    });
  });

  it('redacts sensitive fields nested inside objects and arrays', () => {
    const input = {
      extra: { entries: [{ food_name: 'Banana', calories: 105, meal_type: 'snack' }] },
    };
    expect(scrubSensitiveData(input)).toEqual({
      extra: { entries: [{ food_name: '[redacted]', calories: '[redacted]', meal_type: 'snack' }] },
    });
  });

  it('leaves non-sensitive data untouched', () => {
    const input = { screen: 'workout-preview', modality: 'strength', count: 3 };
    expect(scrubSensitiveData(input)).toEqual(input);
  });

  it('passes through primitives and null unchanged', () => {
    expect(scrubSensitiveData('hello')).toBe('hello');
    expect(scrubSensitiveData(42)).toBe(42);
    expect(scrubSensitiveData(null)).toBe(null);
  });
});
