import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, SafeAreaView, Pressable, Alert, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { moveSession, dropSession } from '@/lib/scheduleGenerator';
import { groupSessionsByDay, findRowAtY, isOverloaded, type RowBounds } from '@/lib/weekMove';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { DayRow } from '@/components/ui/DayRow';
import { DraggableSessionCard, CompletedSessionCard, SessionCardGhost, hapticImpact, type DraggableSession } from '@/components/ui/DraggableSessionCard';

interface PlannedRow {
  id:                 string;
  scheduled_date:     string;
  modality:           DraggableSession['modality'];
  session_label:      string;
  status:             'planned' | 'completed';
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
  // Bounds are content-relative (ScrollView coordinates), not window-absolute.
  const rowBoundsRef       = useRef<Record<string, RowBounds>>({});
  const scrollWrapRef      = useRef<View>(null);
  const scrollViewPageYRef = useRef<number>(0);
  const scrollOffsetRef    = useRef<number>(0);

  const loadRows = useCallback(async () => {
    if (!auth) return;
    const { data, error } = await supabase
      .from('planned_sessions')
      .select('id, scheduled_date, modality, session_label, status')
      .eq('user_id', auth.user.id)
      .in('scheduled_date', week)
      .in('status', ['planned', 'completed'])
      .order('scheduled_date');
    if (!error) setRows((data ?? []) as PlannedRow[]);
  }, [auth?.user.id, monday]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const groups = groupSessionsByDay(rows, week);

  function handleMeasure(date: string, top: number, bottom: number) {
    rowBoundsRef.current[date] = { top, bottom };
  }

  function handleScrollWrapLayout() {
    // The wrapper is a top-level RN View (not nested in another scroll view),
    // so measureInWindow on it is reliable. We need its window-pageY to
    // translate finger absoluteY → ScrollView content coords. Retry on next
    // frame if iOS hasn't populated window coords yet.
    const measure = (attempt: number) => {
      scrollWrapRef.current?.measureInWindow((_x, y) => {
        if (y === 0 && attempt < 3) {
          requestAnimationFrame(() => measure(attempt + 1));
          return;
        }
        scrollViewPageYRef.current = y;
      });
    };
    measure(0);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  }

  function absoluteYToContentY(absY: number): number {
    return absY - scrollViewPageYRef.current + scrollOffsetRef.current;
  }

  function handleLongPress(id: string) {
    if (busy) return;
    setGrabbedId(id);
  }

  const hoverDateRef = useRef<string | null>(null);
  const rowsRef      = useRef<PlannedRow[]>([]);
  useEffect(() => { hoverDateRef.current = hoverDate; }, [hoverDate]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  function handlePanUpdate(id: string, _ty: number, absY: number) {
    const grabbed = rowsRef.current.find((r) => r.id === id);
    if (!grabbed) return;
    const contentY  = absoluteYToContentY(absY);
    const next      = findRowAtY(rowBoundsRef.current, contentY);
    const validNext = next && next !== grabbed.scheduled_date ? next : null;
    if (validNext !== hoverDateRef.current) {
      if (validNext) hapticImpact('light');
      setHoverDate(validNext);
    }
  }

  async function handlePanEnd(id: string, _ty: number, absY: number) {
    const contentY = absoluteYToContentY(absY);
    const target   = findRowAtY(rowBoundsRef.current, contentY);
    const source   = rows.find((r) => r.id === id);
    setHoverDate(null);

    if (!target || !source || target === source.scheduled_date) {
      setGrabbedId(null);
      return;
    }

    // Always stack onto the target day. moveSession relocates the session
    // (old row → 'moved', new planned row at target) — no copy. If the day
    // already has a session, the user can re-drag either one elsewhere.
    hapticImpact('medium');
    await commit(() => moveSession(id, target, auth!.user.id));
    setGrabbedId(null);
  }

  async function commit(fn: () => Promise<unknown>) {
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

        <View ref={scrollWrapRef} onLayout={handleScrollWrapLayout} style={styles.scrollWrap}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!grabbedId}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {week.map((d) => {
            const grabbed = grabbedId ? rows.find((r) => r.id === grabbedId) : null;
            const showGhost = !!(grabbed && hoverDate === d && d !== grabbed.scheduled_date);
            return (
              <DayRow
                key={d}
                date={d}
                weekdayLabel={dayLabel(d)}
                isToday={d === today}
                highlighted={hoverDate === d}
                onMeasure={handleMeasure}
              >
                {groups[d].map((s) => (
                  s.status === 'completed' ? (
                    <CompletedSessionCard
                      key={s.id}
                      modality={s.modality}
                      session_label={s.session_label}
                    />
                  ) : (
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
                  )
                ))}
                {showGhost && grabbed && (
                  <SessionCardGhost
                    modality={grabbed.modality}
                    session_label={grabbed.session_label}
                  />
                )}
              </DayRow>
            );
          })}
        </ScrollView>
        </View>

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
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  scrollWrap:{ flex: 1 },
  header:    { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:   { paddingBottom: spacing.sm },
  actions:   { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, height: 48 + spacing.md },
  dropBtn:   { flex: 1, backgroundColor: colors.heat, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  disabled:  { opacity: 0.45 },
});
