import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { moveSession, dropSession } from '@/lib/scheduleGenerator';
import { swapSessions } from '@/lib/swapSessions';
import { groupSessionsByDay, findRowAtY, isOverloaded, type RowBounds } from '@/lib/weekMove';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { DayRow } from '@/components/ui/DayRow';
import { DraggableSessionCard, type DraggableSession } from '@/components/ui/DraggableSessionCard';
import { SwapPickerSheet, type SwapTarget } from '@/components/ui/SwapPickerSheet';

interface PlannedRow {
  id:                 string;
  scheduled_date:     string;
  modality:           DraggableSession['modality'];
  session_label:      string;
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DEFAULT_MIN = 30;

function mondayOfISO(iso: string): string {
  const d   = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return `${WEEKDAYS[idx]} ${d.getUTCDate()}`;
}

function fullDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long' });
}

export default function WeekMoveScreen() {
  const { session: focusedSessionId, date: focusedDate } = useLocalSearchParams<{ session: string; date: string }>();
  const { session: auth } = useAuthStore();

  const today  = new Date().toLocaleDateString('en-CA');
  const monday = mondayOfISO(focusedDate ?? today);
  const week   = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));

  const [rows,        setRows]        = useState<PlannedRow[]>([]);
  const [grabbedId,   setGrabbedId]   = useState<string | null>(null);
  const [hoverDate,   setHoverDate]   = useState<string | null>(null);
  const [busy,        setBusy]        = useState(false);
  const [pickerTarget,setPickerTarget]= useState<{ date: string; targets: SwapTarget[]; droppedId: string; sourceDate: string } | null>(null);
  const rowBoundsRef = useRef<Record<string, RowBounds>>({});

  const loadRows = useCallback(async () => {
    if (!auth) return;
    const { data, error } = await supabase
      .from('planned_sessions')
      .select('id, scheduled_date, modality, session_label')
      .eq('user_id', auth.user.id)
      .in('scheduled_date', week)
      .eq('status', 'planned')
      .order('scheduled_date');
    if (!error) setRows((data ?? []) as PlannedRow[]);
  }, [auth?.user.id, monday]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const groups = groupSessionsByDay(rows, week);

  function handleMeasure(date: string, top: number, bottom: number) {
    rowBoundsRef.current[date] = { top, bottom };
  }

  function handleLongPress(id: string) {
    if (busy) return;
    setGrabbedId(id);
  }

  function handlePanUpdate(_id: string, _ty: number, absY: number) {
    if (!grabbedId) return;
    setHoverDate(findRowAtY(rowBoundsRef.current, absY));
  }

  async function handlePanEnd(id: string, _ty: number, absY: number) {
    const target = findRowAtY(rowBoundsRef.current, absY);
    const source = rows.find((r) => r.id === id);
    setGrabbedId(null);
    setHoverDate(null);
    if (!target || !source || target === source.scheduled_date) return;

    const targetSessions = groups[target] ?? [];

    if (targetSessions.length === 0) {
      await commit(() => moveSession(id, target, auth!.user.id));
      return;
    }
    if (targetSessions.length === 1) {
      const other = targetSessions[0];
      await commit(() => swapSessions(id, other.id, source.scheduled_date, target, auth!.user.id));
      return;
    }
    setPickerTarget({
      date: target,
      droppedId: id,
      sourceDate: source.scheduled_date,
      targets: targetSessions.map((t) => ({ id: t.id, modality: t.modality, session_label: t.session_label })),
    });
  }

  async function commit(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await loadRows();
    } catch (e: any) {
      Alert.alert('Could not move session', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  function handleSheetSwap(otherId: string) {
    if (!pickerTarget) return;
    const { date, droppedId, sourceDate } = pickerTarget;
    setPickerTarget(null);
    commit(() => swapSessions(droppedId, otherId, sourceDate, date, auth!.user.id));
  }

  function handleSheetAdd() {
    if (!pickerTarget) return;
    const { date, droppedId } = pickerTarget;
    setPickerTarget(null);
    commit(() => moveSession(droppedId, date, auth!.user.id));
  }

  function handleSheetCancel() { setPickerTarget(null); }

  function handleCatchup() {
    if (!focusedSessionId || !focusedDate) return;
    commit(async () => {
      await moveSession(focusedSessionId, shiftDate(focusedDate, 7), auth!.user.id);
      router.back();
    });
  }

  function handleDrop() {
    if (!focusedSessionId) return;
    commit(async () => {
      await dropSession(focusedSessionId);
      router.back();
    });
  }

  function handleBack() {
    if (isOverloaded(groups)) {
      const heavyDays = Object.keys(groups).filter((d) => groups[d].length > 2);
      const first = fullDayLabel(heavyDays[0]);
      const tail  = heavyDays.length > 1 ? ` and ${heavyDays.length - 1} other day${heavyDays.length > 2 ? 's' : ''}` : '';
      Alert.alert(
        'Heavy day ahead',
        `${first}${tail} has ${groups[heavyDays[0]].length} sessions. Keep this layout?`,
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Keep', onPress: () => router.back() },
        ],
      );
      return;
    }
    router.back();
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.mile }}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={handleBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
          </Pressable>
          <VirraText variant="display" size={24} color={colors.pulse}>Move This Week</VirraText>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {week.map((d) => (
            <DayRow
              key={d}
              date={d}
              weekdayLabel={dayLabel(d)}
              isToday={d === today}
              highlighted={hoverDate === d}
              onMeasure={handleMeasure}
            >
              {groups[d].map((s) => (
                <DraggableSessionCard
                  key={s.id}
                  session={{
                    id:                s.id,
                    modality:          s.modality,
                    session_label:     s.session_label,
                    estimated_minutes: DEFAULT_MIN,
                    isFocused:         s.id === focusedSessionId,
                  }}
                  onLongPress={handleLongPress}
                  onPanUpdate={handlePanUpdate}
                  onPanEnd={handlePanEnd}
                  grabbed={grabbedId === s.id}
                  enabled={!busy}
                />
              ))}
            </DayRow>
          ))}

          <View style={styles.actions}>
            <VirraButton label="CATCH UP NEXT WEEK" onPress={handleCatchup} style={{ flex: 1 }} disabled={busy || !focusedSessionId} />
            <Pressable
              style={[styles.dropBtn, busy && styles.disabled]}
              onPress={handleDrop}
              disabled={busy || !focusedSessionId}
              accessibilityRole="button"
            >
              <VirraText variant="mono" size={11} color={colors.mile}>DROP</VirraText>
            </Pressable>
          </View>
        </ScrollView>

        <SwapPickerSheet
          visible={pickerTarget !== null}
          targetDateLabel={pickerTarget ? fullDayLabel(pickerTarget.date) : ''}
          targets={pickerTarget?.targets ?? []}
          onSwap={handleSheetSwap}
          onAddAlongside={handleSheetAdd}
          onCancel={handleSheetCancel}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:   { paddingBottom: spacing.md },
  actions:   { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.lg, height: 48 },
  dropBtn:   { flex: 1, backgroundColor: colors.heat, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  disabled:  { opacity: 0.45 },
});
