import {
  getMonthlyStats,
  getTodayNutritionTotals,
  getTodayCheckin,
} from '@/lib/dashboardData';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function chainFor(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const methods = ['select','eq','gte','in','maybeSingle','single'];
  methods.forEach(m => { obj[m] = jest.fn(() => obj); });
  obj['maybeSingle'] = jest.fn().mockResolvedValue({ data, error });
  obj['single']      = jest.fn().mockResolvedValue({ data, error });
  methods.slice(0, -2).forEach(m => { (obj[m] as jest.Mock).mockReturnValue(obj); });
  return obj;
}

describe('getMonthlyStats', () => {
  it('calculates sessions and adherence from status rows', async () => {
    const rows = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'planned' },
      { status: 'dropped' },
    ];
    const chain: Record<string, unknown> = {};
    const methods = ['select','eq','gte','in'];
    methods.forEach(m => { chain[m] = jest.fn(() => chain); });
    (chain['in'] as jest.Mock).mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMonthlyStats('user-1');
    expect(result.sessionsCompleted).toBe(3);
    expect(result.adherencePct).toBe(60);
  });

  it('returns zeros when no planned_sessions exist', async () => {
    const chain: Record<string, unknown> = {};
    const methods = ['select','eq','gte','in'];
    methods.forEach(m => { chain[m] = jest.fn(() => chain); });
    (chain['in'] as jest.Mock).mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMonthlyStats('user-2');
    expect(result.sessionsCompleted).toBe(0);
    expect(result.adherencePct).toBe(0);
  });
});

describe('getTodayNutritionTotals', () => {
  it('sums food_entries for an existing log', async () => {
    const logRow = {
      id: 'log-1',
      targets_json: { calories: 2300, carbs_g: 275, protein_g: 130, fat_g: 72, fibre_g: 30 },
    };
    const foodRows = [
      { calories: 400, carbs_g: 50, protein_g: 20, fat_g: 15 },
      { calories: 600, carbs_g: 80, protein_g: 30, fat_g: 18 },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const c: Record<string, unknown> = {};
        ['select','eq'].forEach(m => { c[m] = jest.fn(() => c); });
        c['maybeSingle'] = jest.fn().mockResolvedValue({ data: logRow, error: null });
        (c['eq'] as jest.Mock).mockReturnValue(c);
        return c;
      } else {
        const c: Record<string, unknown> = {};
        ['select','eq'].forEach(m => { c[m] = jest.fn(() => c); });
        (c['eq'] as jest.Mock).mockResolvedValue({ data: foodRows, error: null });
        return c;
      }
    });

    const result = await getTodayNutritionTotals('user-1', '2026-06-10', 'luteal', 'hard');
    expect(result.caloriesLogged).toBe(1000);
    expect(result.carbsLogged).toBe(130);
    expect(result.proteinLogged).toBe(50);
    expect(result.fatLogged).toBe(33);
    expect(result.caloriesTarget).toBe(2300);
  });

  it('returns zero logged values when no log exists', async () => {
    mockFrom.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      ['select','eq'].forEach(m => { c[m] = jest.fn(() => c); });
      c['maybeSingle'] = jest.fn().mockResolvedValue({ data: null, error: null });
      (c['eq'] as jest.Mock).mockReturnValue(c);
      return c;
    });

    const result = await getTodayNutritionTotals('user-1', '2026-06-10', null, 'easy');
    expect(result.caloriesLogged).toBe(0);
    expect(result.carbsLogged).toBe(0);
    expect(result.caloriesTarget).toBe(2050);
  });
});

describe('getTodayCheckin', () => {
  it('returns done=true and values when log exists', async () => {
    const logData = { energy: 4, mood: 3, sleep_quality: 5 };
    mockFrom.mockImplementation(() => chainFor(logData));

    const result = await getTodayCheckin('user-1', '2026-06-10');
    expect(result.done).toBe(true);
    expect(result.energy).toBe(4);
    expect(result.mood).toBe(3);
    expect(result.sleep).toBe(5);
  });

  it('returns done=false when no log exists', async () => {
    mockFrom.mockImplementation(() => chainFor(null));

    const result = await getTodayCheckin('user-1', '2026-06-10');
    expect(result.done).toBe(false);
    expect(result.energy).toBeNull();
  });
});
