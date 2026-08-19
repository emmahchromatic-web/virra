import {
  buildProgrammeStructure,
  applyDeloadModulation,
  parseRestSeconds,
  estimateProgrammeMinutes,
} from '@/lib/strengthProgramme';
import type { AuthoredSectionGroup } from '@/lib/getStrongSession';

const authored: AuthoredSectionGroup[] = [
  {
    section: 'mobility',
    label: 'Mobility',
    exercises: [
      { name: 'Ankle rocks', description: null, sets: null, reps: '30s', tempo: null, rest: null },
    ],
  },
  {
    section: 'strength',
    label: 'Strength',
    exercises: [
      { name: 'Back Squat', description: 'Barbell back squat', sets: 4, reps: '6-8', tempo: '3-1-1-0', rest: '120s' },
      { name: 'Romanian Deadlift', description: null, sets: 4, reps: '8', tempo: '3-1-1-0', rest: '90s' },
    ],
  },
  {
    section: 'power_core',
    label: 'Power & Core',
    exercises: [
      { name: 'Box Jump', description: null, sets: 3, reps: '5', tempo: null, rest: '60s' },
      { name: 'Hanging Leg Raise', description: null, sets: 3, reps: '10', tempo: null, rest: '45s' },
    ],
  },
  {
    section: 'accessory',
    label: 'Accessory',
    exercises: [
      { name: 'Calf Raise', description: null, sets: 3, reps: '12', tempo: '2-0-1-0', rest: '45s' },
    ],
  },
];

const meta = { programmeId: 'get-strong-full-body-1', dayIndex: 1, variant: 'gym', block: 1 as const, focus: 'Lower Focus' };

describe('parseRestSeconds', () => {
  test('parses seconds and minutes', () => {
    expect(parseRestSeconds('90s')).toBe(90);
    expect(parseRestSeconds('2 min')).toBe(120);
    expect(parseRestSeconds(null)).toBe(0);
  });
});

describe('buildProgrammeStructure', () => {
  test('produces a v2 structure with authored sections and session_type from focus', () => {
    const v2 = buildProgrammeStructure(authored, meta);
    expect(v2.version).toBe(2);
    expect(v2.session_type).toBe('lower'); // "Lower Focus" -> lower
    expect(v2.sections).toHaveLength(4);
    expect(v2.sections[1].exercises[0].tempo).toBe('3-1-1-0');
    expect(v2.programme).toEqual({ id: meta.programmeId, day_index: 1, variant: 'gym', block: 1 });
    expect(v2.estimated_minutes).toBeGreaterThan(0);
    expect(v2.estimated_minutes).toBe(estimateProgrammeMinutes(v2.sections));
  });

  test('does not mutate the authored input', () => {
    buildProgrammeStructure(authored, meta);
    expect(authored[1].exercises[0].sets).toBe(4);
  });
});

describe('applyDeloadModulation', () => {
  test('caps strength sets at 2 and halves the power section, keeping mobility + accessory', () => {
    const v2       = buildProgrammeStructure(authored, meta);
    const deloaded = applyDeloadModulation(v2, 'Lighter week: 2 sets, ~60% load.');

    const strength = deloaded.sections.find((s) => s.section === 'strength')!;
    expect(strength.exercises.every((e) => (e.sets ?? 0) <= 2)).toBe(true);

    const power = deloaded.sections.find((s) => s.section === 'power_core')!;
    expect(power.exercises).toHaveLength(1); // 2 -> 1 (halved)

    const mobility = deloaded.sections.find((s) => s.section === 'mobility')!;
    expect(mobility.exercises).toHaveLength(1);

    const accessory = deloaded.sections.find((s) => s.section === 'accessory')!;
    expect(accessory.exercises[0].sets).toBe(3); // accessory untouched

    expect(deloaded.deload_note).toBe('Lighter week: 2 sets, ~60% load.');
  });

  test('is pure — the source structure is unchanged', () => {
    const v2 = buildProgrammeStructure(authored, meta);
    applyDeloadModulation(v2, 'note');
    expect(v2.sections.find((s) => s.section === 'strength')!.exercises[0].sets).toBe(4);
    expect(v2.sections.find((s) => s.section === 'power_core')!.exercises).toHaveLength(2);
  });
});
