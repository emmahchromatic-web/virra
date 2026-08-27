/**
 * How much a runner runs each week, and how far their long run goes.
 *
 * The whole engine is three constraints applied in order, most conservative
 * winning. Weekly volume rises by a percentage OR a fixed number of kilometres,
 * whichever is smaller, and never past a ceiling. The long run progresses on its
 * own track — that separation is the single most important safety property here,
 * because a long run dragged up by weekly volume is how people get hurt.
 *
 * Everything is a pure function of its input so a plan is a reviewable diff.
 */

export type AbilityTier  = 'beginner' | 'recreational' | 'intermediate' | 'advanced';
export type VolumePreset = 'gradual' | 'steady' | 'progressive';
export type RaceDistance = '5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra' | 'general';

export type WeekKind = 'build' | 'down' | 'taper' | 'race';

export interface TierLimits {
  /** Nobody starts below this, however little they say they run. */
  floorKm:       number;
  /** Nobody in this tier is progressed past this. */
  ceilingKm:     number;
  /** Hard cap on how much a single week may rise, in km. */
  absStepKm:     number;
  /** Hard cap on how much the long run may rise in a week, in km. */
  longStepKm:    number;
  /** Ceiling on the long run for this tier, before the goal's own cap. */
  maxLongRunKm:  number;
}

export const TIER_LIMITS: Record<AbilityTier, TierLimits> = {
  beginner:     { floorKm:  8, ceilingKm:  35, absStepKm: 2, longStepKm: 1, maxLongRunKm: 12 },
  recreational: { floorKm: 15, ceilingKm:  50, absStepKm: 3, longStepKm: 2, maxLongRunKm: 18 },
  intermediate: { floorKm: 25, ceilingKm:  80, absStepKm: 5, longStepKm: 2, maxLongRunKm: 26 },
  advanced:     { floorKm: 40, ceilingKm: 120, absStepKm: 6, longStepKm: 3, maxLongRunKm: 34 },
};

export const VOLUME_PRESETS: Record<VolumePreset, { rate: number; maxMultiple: number }> = {
  gradual:     { rate: 0.05, maxMultiple: 1.3 },
  steady:      { rate: 0.08, maxMultiple: 1.5 },
  progressive: { rate: 0.10, maxMultiple: 1.8 },
};

/** Weekly volume a plan for this goal builds towards, before tier and preset cut it down. */
export const GOAL_PEAK_KM: Record<RaceDistance, number | null> = {
  '5k':             45,
  '10k':            55,
  half_marathon:    70,
  marathon:         90,
  ultra:           120,
  general:        null,   // no target — the curve is bounded by tier and preset alone
};

/** The longest single run a plan for this goal ever asks for. */
export const GOAL_LONG_CAP_KM: Record<RaceDistance, number> = {
  '5k':            11,
  '10k':           16,
  half_marathon:   21,
  marathon:        32,
  ultra:           42,
  general:         20,
};

/** Race distances in km, for the race week's long run. */
export const RACE_DISTANCE_KM: Record<RaceDistance, number | null> = {
  '5k':             5,
  '10k':           10,
  half_marathon:   21.1,
  marathon:        42.2,
  ultra:           50,
  general:       null,
};

/**
 * Taper, as fractions of peak weekly volume. The last entry is race week.
 * Longer races need longer tapers: a 5K sharpens in a week, a marathon does not.
 */
export const TAPER_FRACTIONS: Record<RaceDistance, number[]> = {
  '5k':          [0.65],
  '10k':         [0.75, 0.60],
  half_marathon: [0.80, 0.55],
  marathon:      [0.80, 0.65, 0.45],
  ultra:         [0.80, 0.65, 0.45],
  general:       [],
};

/** Every fourth week backs off, unless the caller supplies its own weeks. */
export const DEFAULT_DOWN_WEEK_INTERVAL = 4;

/** A down week runs at this fraction of what the week would otherwise have been. */
export const DOWN_WEEK_FRACTION = 0.72;

/**
 * The long run is never more than this share of the week during a build.
 *
 * Goal-dependent on purpose. A 5K runner has no business doing a third of their
 * week in one go; a half or marathon runner on modest mileage has to, because
 * the alternative is arriving at the start line never having run far. Low-volume
 * marathon plans in the wild routinely put 45-50% of the week in the long run.
 *
 * REVIEW: these are the constants most worth a coach's eye before this ships.
 */
export const LONG_RUN_SHARE_BY_GOAL: Record<RaceDistance, number> = {
  '5k':          0.30,
  '10k':         0.33,
  half_marathon: 0.42,
  marathon:      0.45,
  ultra:         0.45,
  general:       0.35,
};

/**
 * How far the long run should reach before race day, whatever the runner's
 * weekly volume. Without this the share cap alone can leave someone racing a
 * distance they have never run: a beginner on 10km/week preparing for a 5K tops
 * out at a 3km long run, which is not a 5K plan.
 *
 * A floor to aim for, not a ceiling — GOAL_LONG_CAP_KM is the ceiling. For the
 * long races it is deliberately short of the race itself: nobody runs the full
 * marathon in training.
 */
export const GOAL_LONG_TARGET_KM: Record<RaceDistance, number> = {
  '5k':             5,
  '10k':           10,
  half_marathon:   18,
  marathon:        32,
  ultra:           42,
  general:         16,
};

/**
 * The long run never exceeds this share of the week, even when reaching the
 * target above would need it to. At low volume the target wins over the soft
 * share; this is the line it cannot cross.
 */
export const LONG_RUN_HARD_SHARE = 0.50;

/**
 * A down week holds the long run rather than growing it, which pushes its share
 * of a smaller week up. This caps how far that can go.
 */
const DOWN_WEEK_LONG_SHARE = 0.45;

/** Taper weeks shrink the long run rather than holding it. */
const TAPER_LONG_SHARE = 0.40;

export interface CurveInput {
  weeks:               number;
  tier:                AbilityTier;
  preset:              VolumePreset;
  goal:                RaceDistance;
  currentWeeklyKm:     number;
  currentLongestRunKm: number;
  /** No race date means no taper: the plan simply ends. */
  hasRace:             boolean;
  /**
   * 1-based week numbers to back off in. Defaults to every fourth week. The
   * cycle-aware generator supplies its own so the down week lands where the
   * runner's own physiology already wants one.
   */
  downWeeks?:          number[];
}

export interface CurveWeek {
  week:      number;   // 1-based
  km:        number;
  longRunKm: number;
  kind:      WeekKind;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Week numbers that back off, on the default every-Nth-week rhythm. */
export function defaultDownWeeks(
  buildWeeks: number,
  interval    = DEFAULT_DOWN_WEEK_INTERVAL,
): number[] {
  const out: number[] = [];
  for (let w = interval; w <= buildWeeks; w += interval) out.push(w);
  return out;
}

/**
 * The week-by-week shape of a plan.
 *
 * Build weeks carry an underlying progression that a down week does not advance
 * and does not reset — backing off for a week should not cost the runner the
 * ground they gained, which is why the displayed volume and the progression are
 * tracked separately.
 */
export function buildVolumeCurve(input: CurveInput): CurveWeek[] {
  const weeks = Math.max(1, Math.floor(input.weeks));
  const tier  = TIER_LIMITS[input.tier];
  const { rate, maxMultiple } = VOLUME_PRESETS[input.preset];

  const startKm = Math.min(
    Math.max(input.currentWeeklyKm > 0 ? input.currentWeeklyKm : tier.floorKm, tier.floorKm),
    tier.ceilingKm,
  );

  const goalPeak = GOAL_PEAK_KM[input.goal];
  const peakKm = Math.max(
    startKm,
    Math.min(tier.ceilingKm, goalPeak ?? Number.POSITIVE_INFINITY, startKm * maxMultiple),
  );

  // Taper eats into the plan from the end. A plan too short to hold its taper
  // gets a shorter one rather than losing its entire build.
  const wantedTaper = input.hasRace ? TAPER_FRACTIONS[input.goal] : [];
  const taperWeeks  = wantedTaper.slice(Math.max(0, wantedTaper.length - (weeks - 1)));
  const buildWeeks  = weeks - taperWeeks.length;

  const downWeeks  = new Set(input.downWeeks ?? defaultDownWeeks(buildWeeks));
  const longCap    = Math.min(tier.maxLongRunKm, GOAL_LONG_CAP_KM[input.goal]);
  const longShare  = LONG_RUN_SHARE_BY_GOAL[input.goal];
  const longTarget = GOAL_LONG_TARGET_KM[input.goal];

  /**
   * The longest run this week may contain. Normally the goal's share of the
   * week — but while the runner is still short of the distance the goal demands,
   * the target wins, bounded by the hard share. Then the ceiling applies to both.
   */
  const longAllowance = (weekKm: number): number => Math.min(
    longCap,
    Math.max(weekKm * longShare, Math.min(longTarget, weekKm * LONG_RUN_HARD_SHARE)),
  );

  const out: CurveWeek[] = [];

  // ---- build ----
  let progression = startKm;
  let longRun = Math.min(
    input.currentLongestRunKm > 0 ? input.currentLongestRunKm : startKm * 0.30,
    longAllowance(startKm),
  );

  for (let w = 1; w <= buildWeeks; w++) {
    const isDown = downWeeks.has(w);

    if (w > 1 && !isDown) {
      // The double constraint: percentage AND absolute, conservative wins.
      progression = Math.min(
        progression * (1 + rate),
        progression + tier.absStepKm,
        peakKm,
      );
    }

    const km = isDown ? progression * DOWN_WEEK_FRACTION : progression;

    if (isDown) {
      // Held, not grown — but not left at an absurd share of a smaller week.
      longRun = Math.min(longRun, km * DOWN_WEEK_LONG_SHARE);
    } else if (w > 1) {
      longRun = Math.min(longRun + tier.longStepKm, longAllowance(km));
    }

    out.push({ week: w, km: round1(km), longRunKm: round1(longRun), kind: isDown ? 'down' : 'build' });
  }

  // ---- taper ----
  const raceKm = RACE_DISTANCE_KM[input.goal];
  taperWeeks.forEach((fraction, i) => {
    const week   = buildWeeks + i + 1;
    const isRace = i === taperWeeks.length - 1;
    let   km     = peakKm * fraction;

    longRun = Math.min(longRun, km * TAPER_LONG_SHARE);

    // A race week has to contain its own race. For a runner whose peak volume is
    // modest — a beginner on a 10K plan, say — the taper fraction alone can put
    // the week below the race distance, which is incoherent.
    if (isRace && raceKm != null) km = Math.max(km, raceKm);

    out.push({
      week,
      km:        round1(km),
      // Race week's long effort is the race itself.
      longRunKm: isRace && raceKm != null ? round1(raceKm) : round1(longRun),
      kind:      isRace ? 'race' : 'taper',
    });
  });

  return out;
}

/** Total distance a curve asks for, which is what the plan preview shows. */
export function curveTotalKm(curve: CurveWeek[]): number {
  return round1(curve.reduce((sum, w) => sum + w.km, 0));
}
