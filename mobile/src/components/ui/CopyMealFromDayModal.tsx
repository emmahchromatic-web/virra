import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraModal } from '@/components/ui/VirraModal';
import { appAlert } from '@/components/ui/VirraAlert';

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
  const d     = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 1) return 'YESTERDAY';
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today.getTime() - LOOKBACK_DAYS * 86400000);
    const iso  = (d: Date) => d.toLocaleDateString('en-CA');

    // Past logs first, so the entry query is bounded by log id rather than
    // scanning every food_entries row the user has ever written.
    const { data: logs, error: logErr } = await supabase
      .from('nutrition_logs')
      .select('id, recorded_on')
      .eq('user_id', userId)
      .gte('recorded_on', iso(from))
      .lt('recorded_on', iso(today))
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
    if (!targetLogId) return;
    setCopying(day.recorded_on);
    // Copy the macros, not the provenance: a copied row is a fresh manual
    // decision, and carrying haiku_input across would let a later re-estimate
    // silently delete the original day's rows too.
    const { error } = await supabase.from('food_entries').insert(
      day.entries.map((e) => ({
        log_id:        targetLogId,
        meal_type:     mealType,
        food_name:     e.food_name,
        quantity_g:    e.quantity_g,
        quantity_unit: e.quantity_unit ?? 'g',
        calories:      e.calories,
        carbs_g:       e.carbs_g,
        protein_g:     e.protein_g,
        fat_g:         e.fat_g,
        fibre_g:       e.fibre_g,
        source:        e.source === 'haiku' ? 'manual' : e.source,
      })),
    );
    setCopying(null);
    if (error) { appAlert('Could not copy meal', error.message); return; }
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
