import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo } from '@/lib/cycleEngine';
import { detectRealignment, type RealignmentPrompt, type RealignmentOption } from '@/lib/runProgramme/realignment';
import { applyRealignment, type ApplyResult } from '@/lib/runProgramme/realignmentActions';
import { getActiveBlocks } from '@/lib/trainingBlocks';

/**
 * Notices when someone has missed training, and carries out what they choose.
 *
 * Dismissing snoozes for the rest of the day rather than for ever: the point is
 * to stop nagging within a session, not to let a fortnight off go unmentioned.
 */
const SNOOZE_KEY = 'realignment_snoozed_on';

export function useRealignment(userId: string | null) {
  const [prompt,  setPrompt]  = useState<RealignmentPrompt | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [snoozedOn, setSnoozedOn] = useState<string | null>(null);

  const cycleProfile = useCycleStore((s) => s.cycleProfile);
  const periodStart  = useCycleStore((s) => s.periodStart);
  const cycleLength  = useCycleStore((s) => s.cycleLength);
  const cycleMode    = useCycleStore((s) => s.cycleMode);

  const today = new Date().toLocaleDateString('en-CA');

  const refresh = useCallback(async () => {
    if (!userId || snoozedOn === today) { setPrompt(null); return; }

    const blocks = await getActiveBlocks(userId);
    const runBlock = blocks.find((b) => b.modality === 'run');
    if (!runBlock) { setPrompt(null); return; }
    setBlockId(runBlock.id);

    const { data, error } = await supabase
      .from('planned_sessions')
      .select('scheduled_date, status')
      .eq('user_id', userId)
      .eq('block_id', runBlock.id)
      .in('status', ['planned', 'completed', 'dropped', 'moved']);
    if (error) { console.warn('[realignment]', error.message); return; }

    // A runner who does not track a cycle gets no menstrual-week exception,
    // because there is nothing to predict from.
    const phaseOn = cycleMode !== 'steady' && periodStart
      ? (iso: string) => getCycleInfo(periodStart, cycleLength, new Date(`${iso}T00:00:00`))?.phase ?? null
      : undefined;

    setPrompt(detectRealignment({
      sessions: (data ?? []) as Array<{ scheduled_date: string; status: string }>,
      today,
      hasRaceDate: Boolean(runBlock.event_id) || Boolean(runBlock.ends_on),
      phaseOn,
    }));
  }, [userId, today, snoozedOn, cycleMode, periodStart, cycleLength, cycleProfile]);

  useEffect(() => { refresh(); }, [refresh]);

  const choose = useCallback(async (option: RealignmentOption): Promise<ApplyResult | null> => {
    if (!userId || !blockId) return null;
    setBusy(true);
    try {
      const result = await applyRealignment(option.action, { userId, blockId, today });
      setPrompt(null);
      return result;
    } catch (e) {
      console.error('[realignment] apply failed', e);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [userId, blockId, today]);

  const dismiss = useCallback(() => {
    setSnoozedOn(today);
    setPrompt(null);
  }, [today]);

  return { prompt, busy, choose, dismiss, refresh, snoozeKey: SNOOZE_KEY };
}
