import { moveSession } from '@/lib/scheduleGenerator';

export async function swapSessions(
  aId:     string,
  bId:     string,
  aDate:   string,
  bDate:   string,
  userId:  string,
): Promise<void> {
  await moveSession(aId, bDate, userId);
  try {
    await moveSession(bId, aDate, userId);
  } catch (e) {
    try { await moveSession(aId, aDate, userId); } catch { /* swallow — surfaced via the throw below */ }
    throw e;
  }
}
