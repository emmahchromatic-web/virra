import React, { useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { applyBreak } from '@/lib/scheduleGenerator';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';
import type { TrainingBlock } from '@/lib/trainingBlocks';

interface Props {
  visible:      boolean;
  userId:       string;
  initialDate?: string; // ISO — pre-fills break_start (from long-press)
  onClose:      () => void;
  onApplied:    () => void;
}

const MODALITY_ICON: Record<string, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'figure.walk',
};

// ---- Inline mono calendar picker ----

const CAL_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CAL_MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                    'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y: number, m: number) {
  const js = new Date(y, m, 1).getDay();
  return js === 0 ? 6 : js - 1; // 0=Mon
}

function CalendarPicker({
  value, minDate, onSelect,
}: {
  value:    Date;
  minDate:  Date;
  onSelect: (d: Date) => void;
}) {
  const [viewY, setViewY] = useState(value.getFullYear());
  const [viewM, setViewM] = useState(value.getMonth());

  function prevMonth() {
    if (viewM === 0) { setViewM(11); setViewY((y) => y - 1); }
    else setViewM((m) => m - 1);
  }
  function nextMonth() {
    if (viewM === 11) { setViewM(0); setViewY((y) => y + 1); }
    else setViewM((m) => m + 1);
  }

  const total  = daysInMonth(viewY, viewM);
  const offset = firstDow(viewY, viewM);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const minY = minDate.getFullYear(), minM = minDate.getMonth(), minD = minDate.getDate();
  const selY = value.getFullYear(),   selM = value.getMonth(),   selD = value.getDate();

  const canPrev = viewY > minY || (viewY === minY && viewM > minM);

  return (
    <View style={cal.wrap}>
      {/* Header */}
      <View style={cal.header}>
        <Pressable onPress={canPrev ? prevMonth : undefined} style={cal.navBtn}>
          <SymbolView name="chevron.left" size={11}
            tintColor={canPrev ? colors.breath : colors.border} />
        </Pressable>
        <VirraText variant="mono" size={10} color={colors.breath} style={{ letterSpacing: 1.5 }}>
          {CAL_MONTHS[viewM]} {viewY}
        </VirraText>
        <Pressable onPress={nextMonth} style={cal.navBtn}>
          <SymbolView name="chevron.right" size={11} tintColor={colors.breath} />
        </Pressable>
      </View>

      {/* Day headers */}
      <View style={cal.row}>
        {CAL_DAYS.map((d, i) => (
          <VirraText key={i} variant="mono" size={9} color={colors.muted} style={cal.cell}>{d}</VirraText>
        ))}
      </View>

      {/* Date grid */}
      {Array.from({ length: cells.length / 7 }, (_, wi) => (
        <View key={wi} style={cal.row}>
          {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
            if (!day) return <View key={di} style={cal.cell} />;
            const isSelected = viewY === selY && viewM === selM && day === selD;
            const isDisabled = viewY < minY
              || (viewY === minY && viewM < minM)
              || (viewY === minY && viewM === minM && day < minD);
            return (
              <Pressable
                key={di}
                style={[cal.cell, cal.dayCell, isSelected && cal.dayCellSelected]}
                onPress={() => !isDisabled && onSelect(new Date(viewY, viewM, day))}
                disabled={isDisabled}
              >
                <VirraText
                  variant="mono"
                  size={11}
                  color={isSelected ? colors.mile : isDisabled ? colors.border : colors.breath}
                >
                  {day}
                </VirraText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const cal = StyleSheet.create({
  wrap:           { marginVertical: spacing.xs, borderRadius: radius.md, overflow: 'hidden' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  navBtn:         { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  row:            { flexDirection: 'row' },
  cell:           { flex: 1, textAlign: 'center', paddingVertical: 2 },
  dayCell:        { alignItems: 'center', paddingVertical: 5, borderRadius: radius.sm },
  dayCellSelected:{ backgroundColor: colors.pulse },
});

// ---- Helpers ----

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toLocalISO(date: Date): string {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function BreakModal({ visible, userId, initialDate, onClose, onApplied }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [activeBlocks,    setActiveBlocks]    = useState<TrainingBlock[]>([]);
  const [blocksLoaded,    setBlocksLoaded]    = useState(false);
  const [breakStart,      setBreakStart]      = useState<Date>(today);
  const [breakEnd,        setBreakEnd]        = useState<Date>(addDays(today, 6));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker,   setShowEndPicker]   = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [mode,            setMode]            = useState<'reschedule' | 'skip'>('reschedule');
  const [saving,          setSaving]          = useState(false);

  // Load blocks and reset state each time the modal opens
  React.useEffect(() => {
    if (!visible) return;
    const s = initialDate ? parseISO(initialDate) : today;
    setBreakStart(s);
    setBreakEnd(addDays(s, 6));
    setShowStartPicker(false);
    setShowEndPicker(false);
    setMode('reschedule');
    setBlocksLoaded(false);

    const todayStr = toLocalISO(today);
    supabase
      .from('training_blocks')
      .select('id, user_id, template_id, starts_on, ends_on, load_modifier, modality, is_primary, event_id, template:plan_templates(name, duration_weeks, distance_goal, sport_type)')
      .eq('user_id', userId)
      .lte('starts_on', todayStr)
      .order('is_primary', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.warn('[BreakModal] block fetch error', error.message); }
        const blocks = error ? [] : ((data ?? []) as unknown as TrainingBlock[])
          .filter((b) => !b.ends_on || b.ends_on >= todayStr);
        setActiveBlocks(blocks);
        setSelectedIds(new Set(blocks.map((b) => b.id)));
        setBlocksLoaded(true);
      });
  }, [visible, initialDate]);

  function toggleBlock(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleConfirm() {
    if (activeBlocks.length > 0 && selectedIds.size === 0) { Alert.alert('Select at least one block'); return; }
    if (breakEnd < breakStart)  { Alert.alert('End date must be on or after start date'); return; }
    setSaving(true);
    try {
      await applyBreak(
        userId,
        Array.from(selectedIds),
        toLocalISO(breakStart),
        toLocalISO(breakEnd),
        mode,
      );
      onApplied();
    } catch (e: any) {
      Alert.alert('Could not apply break', e.message);
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

  const canConfirm = blocksLoaded && (activeBlocks.length === 0 || selectedIds.size > 0) && breakEnd >= breakStart && !saving;

  return (
    <VirraModal visible={visible} onClose={onClose} title="Schedule a Break">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 560 }}>

        {/* DATE RANGE */}
        <VirraText variant="mono" size={9} color={colors.muted} style={brk.sectionLabel}>
          BREAK PERIOD
        </VirraText>

        <Pressable
          style={[brk.dateRow, showStartPicker && brk.dateRowActive]}
          onPress={() => { setShowStartPicker((v) => !v); setShowEndPicker(false); }}
        >
          <VirraText variant="mono" size={9} color={colors.muted}>FROM</VirraText>
          <View style={brk.dateRight}>
            <VirraText variant="mono" size={13} color={colors.breath}>{fmtDate(breakStart)}</VirraText>
            <SymbolView name="calendar" size={13} tintColor={colors.pulse} />
          </View>
        </Pressable>
        {showStartPicker && (
          <CalendarPicker
            value={breakStart}
            minDate={today}
            onSelect={(d) => {
              setBreakStart(d);
              if (d > breakEnd) setBreakEnd(addDays(d, 6));
              setShowStartPicker(false);
            }}
          />
        )}

        <Pressable
          style={[brk.dateRow, showEndPicker && brk.dateRowActive, { marginTop: spacing.xs }]}
          onPress={() => { setShowEndPicker((v) => !v); setShowStartPicker(false); }}
        >
          <VirraText variant="mono" size={9} color={colors.muted}>TO</VirraText>
          <View style={brk.dateRight}>
            <VirraText variant="mono" size={13} color={colors.breath}>{fmtDate(breakEnd)}</VirraText>
            <SymbolView name="calendar" size={13} tintColor={colors.pulse} />
          </View>
        </Pressable>
        {showEndPicker && (
          <CalendarPicker
            value={breakEnd}
            minDate={breakStart}
            onSelect={(d) => {
              setBreakEnd(d);
              setShowEndPicker(false);
            }}
          />
        )}

        {/* AFFECTS */}
        <VirraText variant="mono" size={9} color={colors.muted} style={[brk.sectionLabel, { marginTop: spacing.md }]}>
          AFFECTS
        </VirraText>
        {!blocksLoaded ? (
          <VirraText variant="mono" size={9} color={colors.muted}>Loading plans…</VirraText>
        ) : activeBlocks.length === 0 ? (
          <VirraText variant="mono" size={9} color={colors.muted}>No active plans</VirraText>
        ) : (
          activeBlocks.map((b) => (
            <Pressable key={b.id} style={brk.blockRow} onPress={() => toggleBlock(b.id)}>
              <SymbolView
                name={selectedIds.has(b.id) ? 'checkmark.square.fill' : 'square'}
                size={16}
                tintColor={selectedIds.has(b.id) ? colors.pulse : colors.muted}
              />
              <SymbolView
                name={MODALITY_ICON[b.modality] ?? 'figure.walk'}
                size={14}
                tintColor={colors.muted}
              />
              <VirraText variant="body" size={13} color={colors.breath} style={{ flex: 1 }}>
                {b.template?.name ?? b.modality.charAt(0).toUpperCase() + b.modality.slice(1)}
                {!b.is_primary && (
                  <VirraText variant="mono" size={9} color={colors.muted}>{' · Supp'}</VirraText>
                )}
              </VirraText>
            </Pressable>
          ))
        )}

        {/* MODE */}
        <VirraText variant="mono" size={9} color={colors.muted} style={[brk.sectionLabel, { marginTop: spacing.md }]}>
          HOW TO HANDLE
        </VirraText>
        <View style={brk.modeRow}>
          <Pressable
            style={[brk.modePill, mode === 'reschedule' && brk.modePillActive]}
            onPress={() => setMode('reschedule')}
          >
            <VirraText variant="mono" size={9} color={mode === 'reschedule' ? colors.mile : colors.muted}>
              RESCHEDULE
            </VirraText>
          </Pressable>
          <Pressable
            style={[brk.modePill, mode === 'skip' && brk.modePillActive]}
            onPress={() => setMode('skip')}
          >
            <VirraText variant="mono" size={9} color={mode === 'skip' ? colors.mile : colors.muted}>
              SKIP
            </VirraText>
          </Pressable>
        </View>
        <VirraText variant="mono" size={9} color={colors.muted} style={{ marginTop: 4 }}>
          {mode === 'reschedule'
            ? 'Sessions slide forward · plan extends by the break length'
            : 'Sessions in break window are dropped · plan schedule unchanged'}
        </VirraText>

        <View style={{ height: spacing.md }} />
      </ScrollView>

      <VirraButton
        label={saving ? 'Applying…' : 'Confirm Break'}
        onPress={handleConfirm}
        disabled={!canConfirm}
      />
      <VirraButton label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.xs }} />
    </VirraModal>
  );
}

const brk = StyleSheet.create({
  sectionLabel:  { letterSpacing: 1.5, marginBottom: spacing.xs },
  dateRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.mist, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  dateRowActive: { borderColor: colors.pulse },
  dateRight:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  blockRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modeRow:      { flexDirection: 'row', gap: spacing.sm },
  modePill: {
    flex: 1, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.mist,
  },
  modePillActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
});
