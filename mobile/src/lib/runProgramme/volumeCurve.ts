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
  beginner:     { floorKm:  8, ceilingKm:  35, absStepKm: 2, longStepKm: 1, maxLongRunKm: 16 },
  recreational: { floorKm: 15, ceilingKm:  50, absStepKm: 3, longStepKm: 2, maxLongRunKm: 24 },
  intermediate: { floorKm: 25, ceilingKm:  80, absStepKm: 5, longStepKm: 2, maxLongRunKm: 32 },
  advanced:     { floorKm: 40, ceilingKm: 120, absStepKm: 6, longStepKm: 3, maxLongRunKm: 36 },
};

/**
 * `rate` governs week to week; `maxMultiple` is the ceiling on total growth,
 * relative to where the runner started.
 *
 * The multiples were raised on review (1.3/1.5/1.8 → 1.4/1.7/2.0): the old
 * values capped a 40km/week runner at a 60km peak for a marathon, which is
 * below what published plans build to, and the tier's long-run ceiling then
 * held their longest run to 26km. Both now allow a full marathon build without
 * loosening the week-to-week constraint, which is the one that protects people.
 */
export const VOLUME_PRESETS: Record<VolumePreset, { rate: number; maxMultiple: number }> = {
  gradual:     { rate: 0.05, maxMultiple: 1.4 },
  steady:      { rate: 0.08, maxMultiple: 1.7 },
  progressive: { rate: 0.10, maxMultiple: 2.0 },
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
 * REVIEW: still worth a coach's eye, alongside VOLUME_PRESETS and TIER_LIMITS.
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

/**
 * Where a descending recovery plan starts and ends, as fractions of the
 * runner's normal training volume.
 *
 * It starts BELOW their normal week, not at it. The week after a marathon is
 * not a slightly easier training week, and a recovery plan that opens at full
 * volume has misunderstood what it is for.
 *
 * REVIEW: worth the physio's eye alongside the walk-run ladder.
 */
const DESCEND_START = 0.6;
const DESCEND_FLOOR = 0.3;

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
  /**
   * `build` grows the weeks. `flat` holds them, for plans whose progression is
   * somewhere other than volume — an intensity-led block sharpens the work
   * inside the sessions, and growing the weeks underneath it as well would be
   * two things rising at once. `descend` shrinks them, for the plans whose job
   * is to bring someone down rather than up — the fortnight after a marathon,
   * most obviously. A recovery plan that quietly progressed would be a trap.
   */
  mode?:               'build' | 'flat' | 'descend';
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
  const isFlat = input.mode === 'flat';
  const { rate, maxMultiple } = isFlat
    ? { rate: 0, maxMultiple: 1 }
    : VOLUME_PRESETS[input.preset];

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

  // ---- descend ----
  //
  // Recovery runs the curve backwards: start where the runner is, come down to
  // roughly half of it, and shorten the long run with the week. No back-off
  // weeks, because the whole plan is one.
  if (input.mode === 'descend') {
    const step = weeks > 1 ? (DESCEND_START - DESCEND_FLOOR) / (weeks - 1) : 0;
    let longRun = Math.min(
      input.currentLongestRunKm > 0 ? input.currentLongestRunKm : startKm * 0.30,
      startKm * LONG_RUN_SHARE_BY_GOAL[input.goal],
    );
    for (let w = 1; w <= weeks; w++) {
      const factor = DESCEND_START - step * (w - 1);
      const km = startKm * factor;
      longRun = Math.min(longRun, km * LONG_RUN_SHARE_BY_GOAL[input.goal]);
      out.push({ week: w, km: round1(km), longRunKm: round1(longRun), kind: 'down' });
    }
    return out;
  }

  // ---- build ----
  let progression = startKm;
  // Like weekly volume, the long run carries an underlying progression that a
  // down week displays below but does not undo. Without the separation, every
  // down week costs the runner ground they then have to re-climb at the tier's
  // step rate, and a marathon build never reaches its long run at all.
  let longProgression = Math.min(
    input.currentLongestRunKm > 0 ? input.currentLongestRunKm : startKm * 0.30,
    longAllowance(startKm),
  );
  let longRun = longProgression;

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
      // Shown shorter for the week, but the progression holds its ground.
      longRun = Math.min(longProgression, km * DOWN_WEEK_LONG_SHARE);
    } else {
      if (w > 1) {
        longProgression = Math.min(longProgression + tier.longStepKm, longAllowance(km));
      }
      longRun = longProgression;
    }

    out.push({ week: w, km: round1(km), longRunKm: round1(longRun), kind: isDown ? 'down' : 'build' });
  }

  // ---- taper ----
  const raceKm = RACE_DISTANCE_KM[input.goal];
  taperWeeks.forEach((fraction, i) => {
    const week   = buildWeeks + i + 1;
    const isRace = i === taperWeeks.length - 1;
    let   km     = peakKm * fraction;

    longProgression = Math.min(longProgression, km * TAPER_LONG_SHARE);
    longRun = longProgression;

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
