import { useCycleStore } from '@/store/cycle';
import { computeBaseline } from '@/lib/weightBaseline';
import { computeSteadyBaseline } from '@/lib/weightBaselineSteady';

export async function recomputeBaseline(userId: string): Promise<void> {
  const profile = useCycleStore.getState().cycleProfile;
  if (profile === 'natural' || profile === 'irregular') {
    await computeBaseline(userId);
  } else {
    await computeSteadyBaseline(userId);
  }
}
