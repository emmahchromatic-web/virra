const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { loadMobilityStructure, rankForPhase, type MobilitySessionSummary } from '@/lib/mobilitySessions';

const SESSION = { id: 'hips', name: 'Hips and Lower Back', minutes: 20 };
const MOVES = [
  { name: 'Cat Cow',        description: 'Move slowly through the spine.', reps: '5 breaths',      sets: null, cue: 'Let the breath lead.' },
  { name: '90/90 Hip Switch', description: null,                           reps: '45s each side',  sets: null, cue: null },
];

/** Chain the two queries loadMobilityStructure makes, by table. */
function wire(session: unknown, moves: unknown, opts: { sessionError?: boolean; movesError?: boolean } = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'mobility_sessions') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session, error: opts.sessionError ? { message: 'boom' } : null }) }) }) };
    }
    return { select: () => ({ eq: () => ({ order: async () => ({ data: moves, error: opts.movesError ? { message: 'boom' } : null }) }) }) };
  });
}

/**
 * Card 264. A mobility session becomes the same v2 structure an authored
 * strength session produces, so the workout screen, the rest timer and the
 * finish path all work on it unchanged. These tests pin the parts of that
 * translation the rest of the app depends on.
 */
describe('a mobility session becomes a workout the app already knows how to run', () => {
  beforeEach(() => mockFrom.mockReset());

  it('puts every move in one mobility section', async () => {
    wire(SESSION, MOVES);
    const out = await loadMobilityStructure('hips');

    expect(out!.name).toBe('Hips and Lower Back');
    expect(out!.structure.version).toBe(2);
    expect(out!.structure.sections).toHaveLength(1);
    expect(out!.structure.sections[0].section).toBe('mobility');
    expect(out!.structure.sections[0].exercises.map((e) => e.name))
      .toEqual(['Cat Cow', '90/90 Hip Switch']);
  });

  it('leaves sets, tempo and rest unset, which is what makes the timing work', async () => {
    wire(SESSION, MOVES);
    const [first] = (await loadMobilityStructure('hips'))!.structure.sections[0].exercises;

    // sets null is what makes the app estimate 30s per move rather than
    // counting working sets, and what keeps the stated minutes honest.
    expect(first.sets).toBeNull();
    // A tempo on a stretch is noise, and the rest timer stays silent without one.
    expect(first.tempo).toBeNull();
    expect(first.rest).toBeNull();
    expect(first.reps).toBe('5 breaths');
  });

  it('carries the cue through to the reader, appended to the description', async () => {
    wire(SESSION, MOVES);
    const [first, second] = (await loadMobilityStructure('hips'))!.structure.sections[0].exercises;

    expect(first.description).toBe('Move slowly through the spine. Let the breath lead.');
    // No description and no cue means null, not an empty string, or the UI
    // renders a blank line where guidance should be.
    expect(second.description).toBeNull();
  });

  it('refuses a session with no moves rather than opening an empty workout', async () => {
    wire(SESSION, []);
    expect(await loadMobilityStructure('hips')).toBeNull();
  });

  it('returns null when the session cannot be read', async () => {
    wire(null, MOVES, { sessionError: true });
    expect(await loadMobilityStructure('hips')).toBeNull();
  });
});

const S = (id: string, phases: string[]): MobilitySessionSummary =>
  ({ id, name: id, focus: null, minutes: 20, intensity: 'gentle', phases: phases as never });

describe('choosing a session for the phase she is in', () => {
  const all = [S('everything', ['menstrual', 'follicular', 'ovulatory', 'luteal']), S('luteal-only', ['luteal'])];

  it('prefers the session written for that phase over the one written for all of them', () => {
    expect(rankForPhase(all, 'luteal').map((s) => s.id)).toEqual(['luteal-only', 'everything']);
  });

  it('falls back to everything rather than showing an empty tab', () => {
    // Ten minutes of hip work should not be withheld because of where she is in
    // her cycle. Phase is a preference here, not a filter.
    const noMatch = [S('follicular-only', ['follicular'])];
    expect(rankForPhase(noMatch, 'menstrual').map((s) => s.id)).toEqual(['follicular-only']);
  });

  it('leaves the order alone when the phase is unknown', () => {
    expect(rankForPhase(all, null)).toEqual(all);
  });
});
