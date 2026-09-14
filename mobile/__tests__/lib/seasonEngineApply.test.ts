/**
 * Card 265, tested where it actually failed: the database writes.
 *
 * buildSeasonChain was always testable and always tested. The bugs were in
 * applySeasonChain, which nothing tested, and which chose the plan, sized it and
 * placed it. This drives it with Emma's real season and asserts what reaches the
 * database, because that is what she saw.
 */

const mockCalls: { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }[] = [];

jest.mock('@/lib/supabase', () => {
  const TEMPLATES: Record<string, { id: string; name: string; distance_goal: string; sessions_json: unknown[] }> = {
    '5k':            { id: 'tmpl-5k',   name: 'Beginner 5K',  distance_goal: '5k',            sessions_json: [{ week: 1, sessions: ['easy'] }] },
    'half_marathon': { id: 'tmpl-half', name: 'Half',         distance_goal: 'half_marathon', sessions_json: [] },
    'marathon':      { id: 'tmpl-mara', name: 'Marathon',     distance_goal: 'marathon',      sessions_json: [] },
  };
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let op = 'select';
    let payload: unknown;
    const builder: any = {
      select: () => builder,
      eq:     (col: string, val: unknown) => { filters[col] = val; return builder; },
      order:  () => builder,
      limit:  () => builder,
      insert: (p: unknown) => { op = 'insert'; payload = p; return builder; },
      update: (p: unknown) => { op = 'update'; payload = p; return builder; },
      single: async () => resolve(),
      maybeSingle: async () => resolve(),
      then: (ok: (r: unknown) => void) => ok(resolve()),
    };
    function resolve() {
      mockCalls.push({ table, op, filters: { ...filters }, payload });
      if (table === 'seasons' && op === 'insert')         return { data: { id: 'season-1' }, error: null };
      if (table === 'training_blocks' && op === 'insert') return { data: { id: 'block-1' }, error: null };
      if (table === 'user_profiles')                      return { data: { baseline_pace_seconds_per_km: 330 }, error: null };
      if (table === 'plan_templates') {
        // Filtered by distance: return that distance's template. Unfiltered:
        // the first run template by sort order, which in production is 5K.
        const dg = filters.distance_goal as string | undefined;
        return { data: dg ? (TEMPLATES[dg] ?? null) : TEMPLATES['5k'], error: null };
      }
      return { data: null, error: null };
    }
    return builder;
  };
  return { supabase: { from } };
});

const mockSchedule = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@/lib/scheduleGenerator', () => ({
  generateAndSaveSchedule: (...a: unknown[]) => mockSchedule(...a),
}));

const mockApplyRace = jest.fn(async (..._a: unknown[]) => ({ outcome: 'converted' }));
jest.mock('@/lib/raceSchedule', () => ({
  applyRaceToSchedule: (...a: unknown[]) => mockApplyRace(...a),
}));

jest.mock('@/lib/runProgramme/runnerModel', () => ({
  loadRunnerModel: async () => ({
    tier: 'intermediate', fitnessLevel: 'intermediate', thresholdSecs: 300,
    currentWeeklyKm: 25, currentLongestRunKm: 12, preset: 'standard', difficulty: 'balanced',
  }),
}));

const mockGenerate = jest.fn();
jest.mock('@/lib/runProgramme/generatePlan', () => ({
  generateRunPlan: (input: { weeks: number }) => mockGenerate(input),
  phaseForWeek: () => 'build',
}));

import { buildSeasonChain, applySeasonChain, type SeasonEvent } from '@/lib/seasonEngine';

const EVENTS: SeasonEvent[] = [
  { id: 'sheffield', event_date: '2027-04-04', modality: 'run', distance_goal: 'half_marathon' },
  { id: 'leeds',     event_date: '2027-05-09', modality: 'run', distance_goal: 'marathon' },
];

describe("applySeasonChain on Emma's half-then-marathon season", () => {
  beforeAll(async () => {
    mockGenerate.mockImplementation((input: { weeks: number }) => {
      const weeks = Array.from({ length: input.weeks }, (_, i) => ({ week: i + 1, sessions: ['easy', 'long'] }));
      return { weeks, weekSlots: weeks.map(() => []), curve: weeks.map(() => ({ kind: 'build', longRunKm: 10 })), walkRun: null };
    });
    const chain = buildSeasonChain({ events: EVENTS, cycle_profile: 'natural', today: '2026-09-13' });
    await applySeasonChain('emma', EVENTS, chain, 'HALF MARATHON → MARATHON');
  });

  test('bug 1: the block gets the MARATHON plan, not the first template by sort order', () => {
    const blocks = mockCalls.filter((c) => c.table === 'training_blocks' && c.op === 'insert');
    expect(blocks).toHaveLength(1);
    expect((blocks[0].payload as { template_id: string }).template_id).toBe('tmpl-mara');
    expect((blocks[0].payload as { template_id: string }).template_id).not.toBe('tmpl-5k');
  });

  test('bug 3: the plan is generated for the runner, as a marathon, sixteen weeks long', () => {
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const input = mockGenerate.mock.calls[0][0];
    expect(input.goal).toBe('marathon');
    expect(input.weeks).toBe(16);
    // The long run lands on Sunday, the weekday both races fall on.
    expect(input.longRunDay).toBe(6);
    expect(input.days).toContain(6);
  });

  test('bug 2: sessions are laid from a Monday and capped at the block, so they end on race day', () => {
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const [, , modality, start, weeks, , maxWeeks] = mockSchedule.mock.calls[0];
    expect(modality).toBe('run');
    expect(start).toBe('2027-01-18');
    expect((weeks as unknown[]).length).toBe(16);
    // maxWeeks used to be undefined, which is what let a template overrun the race.
    expect(maxWeeks).toBe(16);
  });

  test('both races are marked in the plan: Leeds as the goal, Sheffield as a tune-up', () => {
    const marked = mockApplyRace.mock.calls.map((c) => c[1]);
    expect(marked).toEqual(expect.arrayContaining([
      { event_date: '2027-05-09', distance_goal: 'marathon' },
      { event_date: '2027-04-04', distance_goal: 'half_marathon' },
    ]));
  });

  test("the tune-up's priority is still recorded, though it has no block of its own", () => {
    const updates = mockCalls.filter((c) => c.table === 'user_events' && c.op === 'update');
    const sheffield = updates.find((u) => u.filters.id === 'sheffield');
    expect((sheffield!.payload as { priority: number }).priority).toBe(2);
  });
});
