import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

/**
 * `enabled` is the Pro gate (card 298). It must NOT be folded into `userId`:
 * the prompt is fetched while the subscription status is still resolving
 * ("unknown" counts as Pro so subscribers get no padlock flash), so a userId
 * that disappears when the status settles leaves a prompt on screen whose
 * every choice silently does nothing. Seen on the simulator, 18 Sep. The id
 * stays; only detection is gated, and a prompt already shown is cleared.
 */
export function useRealignment(userId: string | null, enabled = true) {
  const [prompt,  setPrompt]  = useState<RealignmentPrompt | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [snoozedOn, setSnoozedOn] = useState<string | null>(null);

  const cycleProfile = useCycleStore((s) => s.cycleProfile);
  const periodStart  = useCycleStore((s) => s.periodStart);
  const cycleLength  = useCycleStore((s) => s.cycleLength);
  const periodDays   = useCycleStore((s) => s.periodDays);
  const cycleMode    = useCycleStore((s) => s.cycleMode);

  const today = new Date().toLocaleDateString('en-CA');

  // Only the latest check may write. The status starts "unknown" (which counts
  // as Pro), so a check starts at launch; the status then settles, a second
  // check clears the prompt, and the first one used to land afterwards and put
  // it back — a Pro prompt shown to a lapsed runner. Seen on the simulator,
  // 18 Sep.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++latest.current;
    const current = () => run === latest.current;
    if (!enabled || !userId || snoozedOn === today) { setPrompt(null); return; }

    const blocks = await getActiveBlocks(userId);
    if (!current()) return;
    const runBlock = blocks.find((b) => b.modality === 'run');
    if (!runBlock) { setPrompt(null); return; }
    setBlockId(runBlock.id);

    const { data, error } = await supabase
      .from('planned_sessions')
      .select('scheduled_date, status')
      .eq('user_id', userId)
      .eq('block_id', runBlock.id)
      .in('status', ['planned', 'completed', 'dropped', 'moved']);
    if (!current()) return;
    if (error) { console.warn('[realignment]', error.message); return; }

    // A runner who does not track a cycle gets no menstrual-week exception,
    // because there is nothing to predict from.
    const phaseOn = cycleMode !== 'steady' && periodStart
      ? (iso: string) => getCycleInfo(periodStart, cycleLength, new Date(`${iso}T00:00:00`), periodDays)?.phase ?? null
      : undefined;

    setPrompt(detectRealignment({
      sessions: (data ?? []) as Array<{ scheduled_date: string; status: string }>,
      today,
      hasRaceDate: Boolean(runBlock.event_id) || Boolean(runBlock.ends_on),
      phaseOn,
    }));
  }, [enabled, userId, today, snoozedOn, cycleMode, periodStart, cycleLength, periodDays, cycleProfile]);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((v) => { if (live && v) setSnoozedOn(v); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const choose = useCallback(async (option: RealignmentOption): Promise<ApplyResult | null> => {
    if (!userId || !blockId) return null;
    setBusy(true);
    try {
      // The prompt stays up: the caller shows what happened inside it, and
      // closes it with `close` once the runner has read it.
      return await applyRealignment(option.action, { userId, blockId, today });
    } catch (e) {
      console.error('[realignment] apply failed', e);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [userId, blockId, today]);

  // Dismissing snoozes for the rest of the day, which has to survive leaving
  // the screen: the state alone came back on the next mount, so "Not now" only
  // lasted until the app was reopened.
  const dismiss = useCallback(() => {
    setSnoozedOn(today);
    setPrompt(null);
    void AsyncStorage.setItem(SNOOZE_KEY, today).catch(() => {});
  }, [today]);

  /** Close without snoozing: the prompt has been acted on. */
  const close = useCallback(() => setPrompt(null), []);

  return { prompt, busy, choose, dismiss, close, refresh, snoozeKey: SNOOZE_KEY };
}
