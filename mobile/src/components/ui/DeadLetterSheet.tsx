import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { readDeadLetters, dismissDeadLetter, type OutboxItem, type MutationPayloadMap } from '@/lib/outbox';
import { useOutboxStatus } from '@/store/outboxStatus';

interface Props {
  visible: boolean;
  userId:  string | null;
  onClose: () => void;
}

/** `en-GB`, short: "20 Sep" -- enough to tell a runner which day's item this
 *  is without a full timestamp. */
function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Human-readable, per-kind label for a dead-lettered item. Never dumps raw
 * JSON -- this is what a runner sees when something of theirs failed to save,
 * and it has to read like a sentence, not a payload.
 */
export function labelForDeadLetter(item: OutboxItem): string {
  switch (item.kind) {
    case 'completeWorkout': {
      const payload = item.payload as MutationPayloadMap['completeWorkout'];
      const startedAt = payload.activity?.started_at;
      const date = formatShortDate(typeof startedAt === 'string' ? startedAt : null);
      return date ? `A workout from ${date}` : 'A workout';
    }
    case 'checkIn': {
      const payload = item.payload as MutationPayloadMap['checkIn'];
      const date = formatShortDate(payload.recorded_on);
      return date ? `A check-in from ${date}` : 'A check-in';
    }
    case 'deleteFoodEntry':
      return 'A food entry deletion';
    case 'updateFoodEntry':
      return 'A food entry edit';
    case 'saveMealCombo': {
      const payload = item.payload as MutationPayloadMap['saveMealCombo'];
      return payload.name ? `A saved meal — ${payload.name}` : 'A saved meal';
    }
    case 'toggleFavourite': {
      const payload = item.payload as MutationPayloadMap['toggleFavourite'];
      return payload.desiredState ? 'Adding a recipe favourite' : 'Removing a recipe favourite';
    }
    default:
      return 'An unsaved change';
  }
}

/**
 * What the runner is told about WHY an item failed.
 *
 * Deliberately generic. `lastError` is a raw Postgres/PostgREST string --
 * "new row violates row-level security policy for table ...", "duplicate key
 * value violates unique constraint" -- which tells a runner nothing she can
 * act on and reads like the app broke in front of her. It is still recorded on
 * the item itself for diagnostics; it just isn't the sentence she gets. The
 * actionable half is already in `labelForDeadLetter` ("A workout from 1 Sept")
 * plus the Dismiss control beside it.
 */
function reasonForDeadLetter(): string {
  return "We couldn't save this one, and we've stopped retrying it.";
}

/**
 * The dead-letter sheet -- the first (and, as of this task, only) caller of
 * `dismissDeadLetter`. Opened by tapping the "Unsaved" sync pill.
 *
 * Reads the on-disk dead-letter list fresh every time it opens (not derived
 * from `useOutboxStatus`, which only tracks a count) and lets the user
 * permanently clear entries one at a time. Dismissing here is a distinct,
 * user-initiated action from the automatic optimistic-state revert that
 * `syncPending.ts` already performs for `completeWorkout`/`toggleFavourite`
 * the moment an item dead-letters -- that revert already happened by the time
 * this sheet is ever opened; Dismiss only clears the record of the failure
 * itself.
 */
export function DeadLetterSheet({ visible, userId, onClose }: Props) {
  const [items, setItems] = useState<OutboxItem[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (!userId) { setItems([]); return; }
    let cancelled = false;
    readDeadLetters(userId).then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => { cancelled = true; };
  }, [visible, userId]);

  async function handleDismiss(id: string) {
    // Identity guard: dismissDeadLetter needs a real userId to know which
    // on-disk list to touch. A null session here would otherwise either
    // no-op silently (leaving the item to look dismissed in this sheet but
    // still on disk) or throw against a malformed key -- neither is
    // acceptable for a user-initiated write. Refuse up front instead.
    if (!userId) return;
    await dismissDeadLetter(userId, id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    // Keep the pill's count in sync immediately, without waiting for the
    // next syncPending() pass -- otherwise the pill would keep reading
    // "Unsaved" for an item this sheet just cleared.
    const pendingCount = useOutboxStatus.getState().pendingCount;
    const deadLetterCount = await readDeadLetters(userId).then((l) => l.length);
    useOutboxStatus.getState().setCounts(pendingCount, deadLetterCount);
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title="Couldn't Save">
      {items.length === 0 ? (
        <VirraText variant="body" size={13} color={colors.muted}>
          Nothing here -- everything's saved.
        </VirraText>
      ) : (
        <View style={dls.list}>
          {items.map((item) => (
            <View key={item.id} style={dls.row}>
              <View style={dls.rowText}>
                <VirraText variant="body" size={13} color={colors.breath}>
                  {labelForDeadLetter(item)}
                </VirraText>
                <VirraText variant="body" size={11} color={colors.muted} numberOfLines={2}>
                  {reasonForDeadLetter()}
                </VirraText>
              </View>
              <Pressable
                onPress={() => handleDismiss(item.id)}
                hitSlop={8}
                style={dls.dismissBtn}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss: ${labelForDeadLetter(item)}`}
              >
                <VirraText variant="mono" size={11} color={colors.dawn}>DISMISS</VirraText>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </VirraModal>
  );
}

const dls = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection:   'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    gap:              spacing.sm,
    paddingVertical:  spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor:  colors.mile,
    borderRadius:     radius.md,
    borderWidth:      1,
    borderColor:      colors.control,
  },
  rowText:    { flex: 1, gap: 2 },
  dismissBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
});
