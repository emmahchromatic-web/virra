import type { RaceDistance, VolumePreset } from './volumeCurve';
import type { Difficulty } from './weekComposer';

/**
 * A plan archetype is a parameter pack over the same engine. What separates a
 * marathon plan from a "keep running" plan is not different code, it is a
 * different curve shape, a different set of caps, and whether there is a race
 * at the end of it.
 *
 * Day one covers everything Runna does except triathlon. The clinical ones —
 * postpartum, return after injury — are specified in the spec but deliberately
 * not here: they do not ship until a physio has reviewed the progression.
 */

export type ArchetypeKey =
  | 'race'
  | 'distance_goal'
  | 'improve_5k'
  | 'run_faster'
  | 'run_further'
  | 'maintain'
  | 'train_your_way';

export interface Archetype {
  key:   ArchetypeKey;
  label: string;
  /** Does the plan build towards a fixed date, and therefore taper? */
  hasRace: boolean;
  /** Volume-led plans grow the weeks; intensity-led hold them and sharpen. */
  progression: 'volume' | 'intensity' | 'flat';
  /** Sensible default length when the runner does not pick one. */
  defaultWeeks: number;
  /** Minimum that still produces a coherent plan. */
  minWeeks: number;
  /** Overrides the runner's own preset where the archetype demands it. */
  forcePreset?:     VolumePreset;
  forceDifficulty?: Difficulty;
}

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  race: {
    key: 'race', label: 'Race', hasRace: true,
    progression: 'volume', defaultWeeks: 12, minWeeks: 4,
  },
  distance_goal: {
    key: 'distance_goal', label: 'Distance goal', hasRace: false,
    progression: 'volume', defaultWeeks: 12, minWeeks: 4,
  },
  improve_5k: {
    key: 'improve_5k', label: '5K personal best', hasRace: true,
    progression: 'intensity', defaultWeeks: 8, minWeeks: 4,
    forceDifficulty: 'challenging',
  },
  run_faster: {
    key: 'run_faster', label: 'Run faster', hasRace: false,
    progression: 'intensity', defaultWeeks: 8, minWeeks: 4,
    forceDifficulty: 'challenging',
  },
  run_further: {
    key: 'run_further', label: 'Run further', hasRace: false,
    progression: 'volume', defaultWeeks: 12, minWeeks: 4,
  },
  maintain: {
    key: 'maintain', label: 'Keep running', hasRace: false,
    progression: 'flat', defaultWeeks: 8, minWeeks: 3,
    forcePreset: 'gradual',
  },
  train_your_way: {
    key: 'train_your_way', label: 'Train your way', hasRace: false,
    progression: 'flat', defaultWeeks: 12, minWeeks: 3,
  },
};

/**
 * Which archetype a plan template describes.
 *
 * Templates carry `distance_goal` and a name, and nothing that says what kind
 * of plan they are — so this reads the intent out of what is there. An explicit
 * `archetype_key` column supersedes this the moment one exists.
 */
export function archetypeForTemplate(input: {
  archetypeKey?:  string | null;
  distanceGoal?:  string | null;
  name?:          string | null;
  hasEventDate?:  boolean;
}): Archetype {
  if (input.archetypeKey && input.archetypeKey in ARCHETYPES) {
    return ARCHETYPES[input.archetypeKey as ArchetypeKey];
  }

  const name = (input.name ?? '').toLowerCase();
  if (/\bmaintain|keep running\b/.test(name)) return ARCHETYPES.maintain;
  if (/\bfaster|speed\b/.test(name))          return ARCHETYPES.run_faster;
  if (/\bfurther|endurance\b/.test(name))     return ARCHETYPES.run_further;

  const goal = input.distanceGoal ?? null;
  if (!goal || goal === 'general') return ARCHETYPES.train_your_way;
  if (goal === '5k' && /\bpb|personal best|improve\b/.test(name)) return ARCHETYPES.improve_5k;
  return input.hasEventDate ? ARCHETYPES.race : ARCHETYPES.distance_goal;
}

/** `plan_templates.distance_goal` values map straight onto the curve's goals. */
export function raceDistanceFor(distanceGoal: string | null | undefined): RaceDistance {
  switch (distanceGoal) {
    case '5k':            return '5k';
    case '10k':           return '10k';
    case 'half_marathon': return 'half_marathon';
    case 'marathon':      return 'marathon';
    case 'ultra':         return 'ultra';
    default:              return 'general';
  }
}
