import {
  WORKOUT_PREFERENCE_OPTIONS,
  labelForPreference,
  EQUIPMENT_ASKED_KEY,
} from '@/lib/workoutPreference';
import { variantForPreference, hasEquipmentPreference } from '@/lib/getStrongSession';
import { USER_CACHE_KEYS } from '@/lib/localCaches';
import type { WorkoutPreference } from '@/store/profile';

const ALL: WorkoutPreference[] = ['gym_full', 'home_dumbbells', 'home_bodyweight'];

describe('hasEquipmentPreference — card 246', () => {
  // The whole point of the card: the column defaulted to 'gym_full', so the app
  // could not tell "chose the gym" from "never asked" and silently enrolled a
  // user training at home onto the barbell variant.
  it('treats unset as unset, not as a preference for the gym', () => {
    expect(hasEquipmentPreference(null)).toBe(false);
    expect(hasEquipmentPreference(undefined)).toBe(false);
  });

  it('recognises every real answer', () => {
    for (const p of ALL) expect(hasEquipmentPreference(p)).toBe(true);
  });
});

describe('variantForPreference', () => {
  it('maps each preference to its authored variant', () => {
    expect(variantForPreference('gym_full')).toBe('gym');
    expect(variantForPreference('home_dumbbells')).toBe('dumbbells');
    expect(variantForPreference('home_bodyweight')).toBe('bodyweight');
  });

  it('still falls back to gym for unset, as a last resort only', () => {
    // Plans enrolled before the prompt existed have no preference recorded.
    // The enrolment screen now blocks on this, so it should never be reached
    // for a new enrolment -- but returning undefined would break those plans.
    expect(variantForPreference(null)).toBe('gym');
  });
});

describe('WORKOUT_PREFERENCE_OPTIONS', () => {
  it('offers every preference the type allows', () => {
    // If a fourth variant is ever authored, this fails rather than the picker
    // quietly omitting it.
    expect(WORKOUT_PREFERENCE_OPTIONS.map((o) => o.value).sort()).toEqual([...ALL].sort());
  });

  it('maps each option to the variant the loader will ask for', () => {
    for (const opt of WORKOUT_PREFERENCE_OPTIONS) {
      expect(opt.variant).toBe(variantForPreference(opt.value));
    }
  });

  it('gives every option a label and a description', () => {
    for (const opt of WORKOUT_PREFERENCE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.sub.length).toBeGreaterThan(0);
    }
  });

  it('labels a known preference and returns null for unset', () => {
    expect(labelForPreference('home_dumbbells')).toBe('Dumbbells');
    expect(labelForPreference(null)).toBeNull();
  });

  it('is cleared on sign-out, because "we asked" is about a person', () => {
    // Checking this found a real leak. virra:* is NOT wiped wholesale on sign
    // out -- only the readiness_/hk_/notif_ prefixes and an explicit list -- so
    // an ask-once marker left off that list means the NEXT account on the same
    // phone is never asked. virra:recipes_dietary_asked had been leaking that
    // way since the recipes tab shipped; both are on the list now.
    expect(USER_CACHE_KEYS).toContain(EQUIPMENT_ASKED_KEY);
    expect(USER_CACHE_KEYS).toContain('virra:recipes_dietary_asked');
  });
});
