import { useCycleStore } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { computeBaseline } from '@/lib/weightBaseline';
import { computeSteadyBaseline } from '@/lib/weightBaselineSteady';

/**
 * Recompute whichever weight baselines this user needs and mirror the result
 * into the profile store.
 *
 * The steady baseline is computed for everyone, not just non-cycle users. It is
 * a plain 30-day median, it is cheap, and it is what the weight screen falls
 * back to when a cycle user has no period start logged. Computing it only for
 * non-cycle profiles left `weight_steady_baseline_kg` permanently null for
 * natural/irregular users, which pinned the weight screen on CALIBRATING.
 *
 * Writing back into the store matters too: both compute functions update
 * Supabase directly, and the profile store is otherwise only loaded once per
 * session, so without this the UI would not notice until the next app launch.
 */
export async function recomputeBaseline(userId: string): Promise<void> {
  const profile   = useCycleStore.getState().cycleProfile;
  const isCycle   = profile === 'natural' || profile === 'irregular';
  const setLocal  = useProfileStore.getState().setLocal;

  const steady = await computeSteadyBaseline(userId);
  setLocal({
    weightSteadyBaselineKg:         steady,
    weightSteadyBaselineComputedAt: new Date().toISOString(),
  });

  if (isCycle) {
    const cycle = await computeBaseline(userId);
    setLocal({ weightBaselineKg: cycle });
  }
}
