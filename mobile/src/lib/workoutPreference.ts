import type { WorkoutPreference } from '@/store/profile';
import type { ProgrammeVariant } from '@/lib/getStrongSession';

/**
 * Card 246. Equipment preference decides which authored variant of a Get Strong
 * programme a user is enrolled on, and until now nothing ever asked for it:
 * the column defaulted to 'gym_full' and the app could not tell that apart from
 * a real answer.
 *
 * `null` means genuinely unset, which is a first-class state rather than a
 * missing one. An unset user is shown every variant at enrolment instead of
 * being guessed at.
 */
export interface WorkoutPreferenceOption {
  value:   WorkoutPreference;
  variant: ProgrammeVariant;
  label:   string;
  sub:     string;
}

export const WORKOUT_PREFERENCE_OPTIONS: WorkoutPreferenceOption[] = [
  { value: 'gym_full',       variant: 'gym',        label: 'Gym',        sub: 'Full kit: barbells, machines, cables' },
  { value: 'home_dumbbells', variant: 'dumbbells',  label: 'Dumbbells',  sub: 'Training at home with weights'        },
  { value: 'home_bodyweight',variant: 'bodyweight', label: 'Bodyweight', sub: 'No equipment needed'                  },
];

/** Asked once per install, matching the recipes tab's dietary prompt. */
export const EQUIPMENT_ASKED_KEY = 'virra:equipment_preference_asked';

export const EQUIPMENT_PROMPT_TITLE = 'Where do you train?';
export const EQUIPMENT_PROMPT_BODY  =
  'Strength programmes come in three versions so the exercises match what you have to hand. You can change this in your profile at any time.';
/** Dismissal must read as a real option, not a failure to answer. */
export const EQUIPMENT_PROMPT_SKIP  = "I'll decide later";

export function labelForPreference(pref: WorkoutPreference | null | undefined): string | null {
  return WORKOUT_PREFERENCE_OPTIONS.find((o) => o.value === pref)?.label ?? null;
}
