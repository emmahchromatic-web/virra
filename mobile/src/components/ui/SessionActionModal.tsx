import React, { useState } from 'react';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { VirraButton } from './VirraButton';
import { dropSession, moveSession } from '@/lib/scheduleGenerator';
import { supabase } from '@/lib/supabase';
import type { CalendarSession } from './MonthCalendar';

interface Props {
  visible:   boolean;
  date:      string;
  sessions:  CalendarSession[];
  userId:    string;
  onClose:   () => void;
  onMutate:  () => void;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function mondayOfISO(iso: string): string {
  const d   = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

export function SessionActionModal({ visible, date, sessions, userId, onClose, onMutate }: Props) {
  const [busy, setBusy] = useState(false);
  const [noFreeDay, setNoFreeDay] = useState<Record<string, boolean>>({});

  async function handleDrop(s: CalendarSession) {
    setBusy(true);
    try { await dropSession(s.id); onMutate(); }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Could not drop session', msg);
    }
    finally { setBusy(false); }
  }

  async function handleMoveThisWeek(s: CalendarSession) {
    const monday    = mondayOfISO(date);
    const jsDay     = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayIdx    = jsDay === 0 ? 6 : jsDay - 1;
    const weekDates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));

    const { data: occupied } = await supabase
      .from('planned_sessions')
      .select('scheduled_date')
      .eq('user_id', userId)
      .eq('modality', s.modality)
      .eq('session_label', s.session_label)
      .in('status', ['planned', 'completed'])
      .in('scheduled_date', weekDates);

    const occupiedSet = new Set((occupied ?? []).map((r: any) => r.scheduled_date));
    occupiedSet.add(date);

    const freeDay = weekDates.slice(dayIdx + 1).find((d) => !occupiedSet.has(d));
    if (!freeDay) {
      setNoFreeDay((prev) => ({ ...prev, [s.id]: true }));
      return;
    }

    setBusy(true);
    try {
      await moveSession(s.id, freeDay, userId);
      onMutate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Could not move session', msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleCatchup(s: CalendarSession) {
    setBusy(true);
    try { await moveSession(s.id, shiftDate(date, 7), userId); onMutate(); }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Could not move session', msg);
    }
    finally { setBusy(false); }
  }

  const title = new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <VirraModal visible={visible} onClose={onClose} title={title}>
      {sessions.map((s) => (
        <View key={s.id} style={modal.sessionBlock}>
          <VirraText variant="bodyMedium" size={14} color={colors.breath}>
            {s.session_label.charAt(0).toUpperCase() + s.session_label.slice(1)}
            {'  '}
            <VirraText variant="mono" size={9} color={colors.muted}>
              {s.modality.toUpperCase()}
            </VirraText>
          </VirraText>
          {s.status === 'planned' && (
            <View style={modal.actions}>
              <Pressable style={modal.actionBtn} onPress={() => handleDrop(s)} disabled={busy}>
                <SymbolView name="xmark.circle" size={13} tintColor={colors.heat} />
                <VirraText variant="mono" size={9} color={colors.heat}>DROP</VirraText>
              </Pressable>
              {noFreeDay[s.id] ? (
                <VirraText variant="mono" size={9} color={colors.muted} style={{ flex: 1 }}>
                  No free day this week — use Catch-Up to reschedule next week.
                </VirraText>
              ) : (
                <Pressable style={modal.actionBtn} onPress={() => handleMoveThisWeek(s)} disabled={busy}>
                  <SymbolView name="arrow.left.arrow.right" size={13} tintColor={colors.muted} />
                  <VirraText variant="mono" size={9} color={colors.muted}>MOVE THIS WEEK</VirraText>
                </Pressable>
              )}
              <Pressable style={modal.actionBtn} onPress={() => handleCatchup(s)} disabled={busy}>
                <SymbolView name="calendar.badge.plus" size={13} tintColor={colors.pulse} />
                <VirraText variant="mono" size={9} color={colors.pulse}>CATCH-UP</VirraText>
              </Pressable>
            </View>
          )}
          {s.status === 'completed' && (
            <VirraText variant="mono" size={9} color={colors.pulse}>COMPLETED</VirraText>
          )}
          {s.status === 'dropped' && (
            <VirraText variant="mono" size={9} color={colors.muted}>DROPPED</VirraText>
          )}
        </View>
      ))}
      <VirraButton label="Close" variant="ghost" onPress={onClose} style={{ marginTop: spacing.md }} />
    </VirraModal>
  );
}

const modal = StyleSheet.create({
  sessionBlock: { gap: spacing.xs, paddingVertical: spacing.xs,
                  borderBottomWidth: 1, borderBottomColor: colors.border },
  actions:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingVertical: 6, paddingHorizontal: spacing.sm,
                  borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
});
