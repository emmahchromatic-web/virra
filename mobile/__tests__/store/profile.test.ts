import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfileStore } from '@/store/profile';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) },
}));

beforeEach(async () => { await AsyncStorage.clear(); });

describe('profile store persistence', () => {
  it('persists firstName/lastName/etc across a fresh store instance', async () => {
    useProfileStore.setState({ firstName: 'Emma', lastName: 'Harrison', isLoaded: true, fetchedAt: new Date().toISOString() });
    // Zustand's persist writes asynchronously; give it a tick.
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:profile:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.firstName).toBe('Emma');
  });

  it('does not persist functions or the isLoaded flag', async () => {
    useProfileStore.setState({ firstName: 'Emma', isLoaded: true });
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:profile:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.load).toBeUndefined();
    expect(parsed.state.isLoaded).toBeUndefined();
  });

  it('stamps fetchedAt when load() succeeds', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
      data: { first_name: 'Emma', last_name: 'H', avatar_url: null, steps_target: 8000, workout_preference: null,
        haiku_disclosure_acknowledged_at: null, track_weight: false, height_cm: null, date_of_birth: null, sex: null,
        injury_history: null, injury_level: null, weight_baseline_kg: null, weight_phase_bands: null,
        weight_explainer_dismissed_at: null, weight_steady_baseline_kg: null, weight_steady_baseline_computed_at: null },
    }) }) }) });
    await useProfileStore.getState().load('user-1');
    expect(useProfileStore.getState().fetchedAt).not.toBeNull();
  });

  it('a failed load() leaves fetchedAt and existing data untouched', async () => {
    useProfileStore.setState({ firstName: 'Emma', fetchedAt: '2026-09-01T00:00:00Z' });
    const { supabase } = require('@/lib/supabase');
    supabase.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error('offline')) }) }) });
    await useProfileStore.getState().load('user-1').catch(() => {});
    expect(useProfileStore.getState().firstName).toBe('Emma');
    expect(useProfileStore.getState().fetchedAt).toBe('2026-09-01T00:00:00Z');
  });
});
