import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { uuid } from 'expo-modules-core';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraModal } from '@/components/ui/VirraModal';
import { appAlert } from '@/components/ui/VirraAlert';
import { enqueue, type LogFoodEntryRow } from '@/lib/outbox';
import { syncPending } from '@/lib/syncPending';
import { useNutritionDay } from '@/store/nutritionDay';
import { todayIso, shiftIso, fromIso, daysAgo } from '@/lib/localDate';

/** How far back to offer. Two weeks covers "the same breakfast as Sunday". */
const LOOKBACK_DAYS = 14;

interface CopyableEntry {
  food_name:     string;
  quantity_g:    number | null;
  quantity_unit: string | null;
  calories:      number;
  carbs_g:       number;
  protein_g:     number;
  fat_g:         number;
  fibre_g:       number;
  source:        string;
}

interface CopyableDay {
  recorded_on: string;
  entries:     CopyableEntry[];
}

interface Props {
  visible:   boolean;
  userId:    string;
  mealType:  string;
  /** Today's nutrition_logs row, the destination for the copy. */
  targetLogId: string | null;
  onClose:   () => void;
  onCopied:  () => void;
}

function dayLabel(iso: string): string {
  const diff = daysAgo(iso);
  if (diff === 1) return 'YESTERDAY';
  const d = fromIso(iso);
  if (diff < 7)   return d.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

export function CopyMealFromDayModal({ visible, userId, mealType, targetLogId, onClose, onCopied }: Props) {
  const [days,    setDays]    = useState<CopyableDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mealType]);

  async function load() {
    setLoading(true);
    setDays([]);

    const today = todayIso();
    const from  = shiftIso(today, -LOOKBACK_DAYS);

    // Past logs first, so the entry query is bounded by log id rather than
    // scanning every food_entries row the user has ever written.
    //
    // `.lt(today)` is what keeps today's own log out of a list of days to copy
    // FROM, so it has to be the same key the rest of the nutrition path calls
    // today -- all of it local now, per card 325.
    const { data: logs, error: logErr } = await supabase
      .from('nutrition_logs')
      .select('id, recorded_on')
      .eq('user_id', userId)
      .gte('recorded_on', from)
      .lt('recorded_on', today)
      .order('recorded_on', { ascending: false });

    if (logErr) { setLoading(false); appAlert('Could not load previous days', logErr.message); return; }
    if (!logs?.length) { setLoading(false); return; }

    const byId = new Map(logs.map((l) => [l.id, l.recorded_on as string]));
    const { data: entries, error: entryErr } = await supabase
      .from('food_entries')
      .select('log_id, food_name, quantity_g, quantity_unit, calories, carbs_g, protein_g, fat_g, fibre_g, source')
      .in('log_id', logs.map((l) => l.id))
      .eq('meal_type', mealType);

    setLoading(false);
    if (entryErr) { appAlert('Could not load previous days', entryErr.message); return; }

    const grouped = new Map<string, CopyableEntry[]>();
    for (const e of entries ?? []) {
      const date = byId.get(e.log_id as string);
      if (!date) continue;
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date)!.push(e as unknown as CopyableEntry);
    }

    setDays(
      [...grouped.entries()]
        .map(([recorded_on, es]) => ({ recorded_on, entries: es }))
        .sort((a, b) => (a.recorded_on < b.recorded_on ? 1 : -1)),
    );
  }

  async function copyDay(day: CopyableDay) {
    if (!targetLogId || !userId) return;
    setCopying(day.recorded_on);
    // Copy the macros, not the provenance: a copied row is a fresh manual
    // decision, and carrying haiku_input across would let a later re-estimate
    // silently delete the original day's rows too.
    //
    // `id` is generated up front, same reasoning as food-search.tsx's
    // handleAdd/handleAddManual/handleAddCombo: the eventual outbox replay
    // (an upsert on `id`) then matches whatever may have already landed,
    // instead of creating duplicate rows.
    const rows: LogFoodEntryRow[] = day.entries.map((e) => ({
      id:             uuid.v4(),
      log_id:         targetLogId,
      meal_type:      mealType as LogFoodEntryRow['meal_type'],
      food_name:      e.food_name,
      quantity_g:     e.quantity_g,
      quantity_unit:  e.quantity_unit ?? 'g',
      calories:       e.calories,
      carbs_g:        e.carbs_g,
      protein_g:      e.protein_g,
      fat_g:          e.fat_g,
      fibre_g:        e.fibre_g,
      nutritionix_id: null,
      source:         (e.source === 'haiku' ? 'manual' : e.source) as LogFoodEntryRow['source'],
      haiku_input:    null,
      confidence:     null,
    }));

    const { error } = await supabase.from('food_entries').insert(rows);
    if (error) {
      // Offline (or a transient server blip) -- queue it and let her carry
      // on, same pattern as food-search.tsx's handleAdd/handleAddCombo.
      await enqueue(userId, 'logFoodEntries', { rows });
      syncPending(userId);
    }
    useNutritionDay.getState().addEntryLocal(todayIso(), rows);
    setCopying(null);
    onCopied();
    onClose();
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title={`Copy ${mealType} from`}>
      {loading && <ActivityIndicator color={colors.pulse} style={{ marginVertical: spacing.lg }} />}

      {!loading && days.length === 0 && (
        <VirraText variant="body" size={14} color={colors.muted} style={{ paddingVertical: spacing.md }}>
          Nothing logged for {mealType} in the last {LOOKBACK_DAYS} days.
        </VirraText>
      )}

      {days.map((day) => {
        const kcal = Math.round(day.entries.reduce((a, e) => a + (e.calories ?? 0), 0));
        return (
          <Pressable
            key={day.recorded_on}
            onPress={() => copyDay(day)}
            disabled={!targetLogId || copying !== null}
            style={({ pressed }) => [styles.day, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${mealType} from ${dayLabel(day.recorded_on)}`}
          >
            <View style={styles.dayHead}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>
                {dayLabel(day.recorded_on)}
              </VirraText>
              <VirraText variant="mono" size={11} color={colors.muted}>
                {copying === day.recorded_on ? 'COPYING…' : `${kcal} KCAL`}
              </VirraText>
            </View>
            <VirraText variant="body" size={13} color={colors.breath} numberOfLines={2}>
              {day.entries.map((e) => e.food_name).join(', ')}
            </VirraText>
          </Pressable>
        );
      })}
    </VirraModal>
  );
}

const styles = StyleSheet.create({
  day: {
    gap:             spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.control,
  },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
