import { archetypeForTemplate, ARCHETYPES, type ArchetypeKey } from '@/lib/runProgramme/archetypes';

/**
 * Card 266. The stored `plan_templates.archetype_key` replaces reading intent
 * out of a template's name. These tests are about the property that matters:
 * a row with a key survives being renamed to anything at all.
 */

// What the migration writes. Keeping the table here means a backfill that
// disagrees with the code fails in CI rather than in someone's plan.
const BACKFILL: Array<[name: string, distanceGoal: string | null, key: ArchetypeKey]> = [
  ['New to Running',      null,            'new_to_running'],
  ['Path to parkrun',     '5k',            'path_to_parkrun'],
  ['Return to Running',   null,            'return_after_break'],
  ['Beginner 5K',         '5k',            'distance_goal'],
  ['Intermediate 10K',    '10k',           'distance_goal'],
  ['Half Marathon Build', 'half_marathon', 'distance_goal'],
  ['Marathon Foundation', 'marathon',      'distance_goal'],
  ['General Fitness',     null,            'train_your_way'],
];

describe('the stored key wins over the name', () => {
  it.each(BACKFILL)('%s resolves to its stored key', (_name, distanceGoal, key) => {
    expect(archetypeForTemplate({ archetypeKey: key, distanceGoal }).key).toBe(key);
  });

  it('survives a rename to something that would have matched a different archetype', () => {
    // The exact failure this card exists to prevent: "Path to parkrun" renamed
    // to something without "parkrun" in it used to become a continuous-running
    // plan for people who cannot yet run continuously.
    const renamed = archetypeForTemplate({
      archetypeKey: 'path_to_parkrun', name: 'Your first 5K', distanceGoal: '5k',
    });
    expect(renamed.key).toBe('path_to_parkrun');
    expect(renamed.progression).toBe('walk_run');
  });

  it('survives a rename that actively collides with another regex', () => {
    // "Speed" would hit /\bfaster|speed\b/ and become run_faster.
    expect(archetypeForTemplate({
      archetypeKey: 'distance_goal', name: '5K Speed Starter', distanceGoal: '5k',
    }).key).toBe('distance_goal');

    // Without a key, the same rename does exactly that — which is the bug.
    expect(archetypeForTemplate({ name: '5K Speed Starter', distanceGoal: '5k' }).key)
      .toBe('run_faster');
  });
});

describe('what the stored key deliberately does NOT freeze', () => {
  it('upgrades a distance goal to a race when the runner sets a date', () => {
    const withDate = archetypeForTemplate({
      archetypeKey: 'distance_goal', distanceGoal: 'marathon', hasEventDate: true,
    });
    expect(withDate.key).toBe('race');
    expect(withDate.hasRace).toBe(true);
  });

  it('leaves it a distance goal with no date, so nothing tapers to nowhere', () => {
    const noDate = archetypeForTemplate({
      archetypeKey: 'distance_goal', distanceGoal: 'marathon', hasEventDate: false,
    });
    expect(noDate.key).toBe('distance_goal');
    expect(noDate.hasRace).toBe(false);
  });

  it('does not upgrade anything else a date is set on', () => {
    // A walk-run plan with a race date is still a walk-run plan. Path to
    // parkrun carries its own race already.
    for (const key of ['new_to_running', 'path_to_parkrun', 'return_after_break', 'maintain'] as const) {
      expect(archetypeForTemplate({ archetypeKey: key, hasEventDate: true }).key).toBe(key);
    }
  });

  it('matches the un-keyed behaviour exactly, so the backfill is a no-op on day one', () => {
    for (const [name, distanceGoal, key] of BACKFILL) {
      for (const hasEventDate of [false, true]) {
        const byName = archetypeForTemplate({ name, distanceGoal, hasEventDate });
        const byKey  = archetypeForTemplate({ archetypeKey: key, name, distanceGoal, hasEventDate });
        expect(byKey.key).toBe(byName.key);
      }
    }
  });
});

describe('falling back', () => {
  it('still reads the name when there is no key', () => {
    expect(archetypeForTemplate({ name: 'Path to parkrun' }).key).toBe('path_to_parkrun');
  });

  it('ignores a key that names nothing, rather than throwing', () => {
    expect(archetypeForTemplate({ archetypeKey: 'nonsense', name: 'Path to parkrun' }).key)
      .toBe('path_to_parkrun');
  });

  it('ignores an empty key', () => {
    expect(archetypeForTemplate({ archetypeKey: '', name: 'Path to parkrun' }).key)
      .toBe('path_to_parkrun');
    expect(archetypeForTemplate({ archetypeKey: null, name: 'General Fitness' }).key)
      .toBe('train_your_way');
  });

  it('every key the migration writes is a real archetype', () => {
    for (const [, , key] of BACKFILL) expect(ARCHETYPES[key]).toBeDefined();
  });
});
