import { useProfileStore } from '@/store/profile';
import { hasEquipmentPreference } from '@/lib/getStrongSession';

const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
      }),
    }),
  },
}));

/**
 * Card 246 failed build 14 here, one layer below where it was tested.
 *
 * The 20260830 migration made `workout_preference` nullable so that "never
 * asked" was a state the database could hold, and `hasEquipmentPreference`
 * already handled null correctly -- its unit test passed the whole time. What
 * nobody tested was the boundary in between: the store typed the field
 * non-nullable, initialised it to 'gym_full' and coerced the loaded value with
 * `?? 'gym_full'`, so null never survived far enough for that helper to see it.
 *
 * A new account was therefore never asked where she trains, was enrolled on the
 * barbell variant, and read "Gym" in her profile.
 */
describe('profile store keeps "never asked" intact — card 246', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    useProfileStore.setState({ workoutPreference: null, isLoaded: false });
  });

  it('starts unset rather than pretending the user chose the gym', () => {
    expect(useProfileStore.getState().workoutPreference).toBeNull();
    expect(hasEquipmentPreference(useProfileStore.getState().workoutPreference)).toBe(false);
  });

  it('keeps a null column as null instead of defaulting it to the gym', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { first_name: 'Emma', workout_preference: null } });

    await useProfileStore.getState().load('user-1');

    const pref = useProfileStore.getState().workoutPreference;
    expect(pref).toBeNull();
    // The prompt on the training tab is gated on exactly this call.
    expect(hasEquipmentPreference(pref)).toBe(false);
    expect(useProfileStore.getState().isLoaded).toBe(true);
  });

  it('still carries a real answer through', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { first_name: 'Emma', workout_preference: 'home_dumbbells' } });

    await useProfileStore.getState().load('user-1');

    expect(useProfileStore.getState().workoutPreference).toBe('home_dumbbells');
    expect(hasEquipmentPreference(useProfileStore.getState().workoutPreference)).toBe(true);
  });
});
