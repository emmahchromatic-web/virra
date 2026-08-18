import { defaultMealSlot } from '@/lib/nutritionLog';

// Build a Date at a specific local hour:minute today.
function at(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('defaultMealSlot', () => {
  it('maps each window to the right meal', () => {
    // 05:00–10:00 breakfast
    expect(defaultMealSlot(at(5, 0))).toBe('breakfast');
    expect(defaultMealSlot(at(9, 59))).toBe('breakfast');
    // 10:00–12:00 snack
    expect(defaultMealSlot(at(10, 0))).toBe('snack');
    expect(defaultMealSlot(at(11, 59))).toBe('snack');
    // 12:00–14:30 lunch
    expect(defaultMealSlot(at(12, 0))).toBe('lunch');
    expect(defaultMealSlot(at(14, 29))).toBe('lunch');
    // 14:30–17:00 snack
    expect(defaultMealSlot(at(14, 30))).toBe('snack');
    expect(defaultMealSlot(at(16, 59))).toBe('snack');
    // 17:00–21:00 dinner
    expect(defaultMealSlot(at(17, 0))).toBe('dinner');
    expect(defaultMealSlot(at(20, 59))).toBe('dinner');
    // 21:00–05:00 snack (incl. overnight)
    expect(defaultMealSlot(at(21, 0))).toBe('snack');
    expect(defaultMealSlot(at(23, 30))).toBe('snack');
    expect(defaultMealSlot(at(0, 0))).toBe('snack');
    expect(defaultMealSlot(at(4, 59))).toBe('snack');
  });
});
