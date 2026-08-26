export type InjuryLevel = 'none' | 'niggles' | 'managing' | 'declined';

/**
 * Injury history bands, shared by the onboarding step and the profile editor so
 * the two cannot drift apart.
 *
 * Worded so someone can answer honestly about themselves without
 * self-diagnosing: the question is how often injuries happen and whether one is
 * live now, not what the injury is. Card 3 / card 224 follow-up.
 */
export const INJURY_LEVELS: { value: InjuryLevel; label: string; detail: string }[] = [
  { value: 'none',     label: 'Nothing to speak of', detail: "Injuries haven't really been a feature." },
  { value: 'niggles',  label: 'The odd niggle',      detail: "Occasional minor issues, or one bigger injury you're fully over." },
  { value: 'managing', label: 'Managing something',  detail: 'A recent or ongoing injury, or ones that keep coming back.' },
  { value: 'declined', label: 'Rather not say',      detail: '' },
];

export const INJURY_LABEL: Record<InjuryLevel, string> =
  INJURY_LEVELS.reduce((acc, o) => ({ ...acc, [o.value]: o.label }), {} as Record<InjuryLevel, string>);
