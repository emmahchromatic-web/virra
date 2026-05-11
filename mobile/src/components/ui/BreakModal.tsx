import React, { useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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

    supabase
      .from('training_blocks')
      .select('id, user_id, template_id, starts_on, ends_on, load_modifier, modality, is_primary, event_id, template:plan_templates(name, duration_weeks, distance_goal, sport_type)')
      .eq('user_id', userId)
      .lte('starts_on', toLocalISO(today))
      .or(`ends_on.is.null,ends_on.gte.${toLocalISO(today)}`)
      .order('is_primary', { ascending: false })
      .then(({ data }) => {
        const blocks = (data ?? []) as unknown as TrainingBlock[];
        setActiveBlocks(blocks);
        setSelectedIds(new Set(blocks.map((b) => b.id)));
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
    if (selectedIds.size === 0) { Alert.alert('Select at least one block'); return; }
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

  const canConfirm = selectedIds.size > 0 && breakEnd >= breakStart && !saving;

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
          <DateTimePicker
            value={breakStart}
            mode="date"
            display="inline"
            minimumDate={today}
            accentColor={colors.pulse}
            textColor="rgba(244,237,224,0.75)"
            onChange={(_: DateTimePickerEvent, d?: Date) => {
              if (d) {
                setBreakStart(d);
                if (d > breakEnd) setBreakEnd(addDays(d, 6));
                setShowStartPicker(false);
              }
            }}
            style={brk.inlinePicker}
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
          <DateTimePicker
            value={breakEnd}
            mode="date"
            display="inline"
            minimumDate={breakStart}
            accentColor={colors.pulse}
            onChange={(_: DateTimePickerEvent, d?: Date) => {
              if (d) {
                setBreakEnd(d);
                setShowEndPicker(false);
              }
            }}
            style={brk.inlinePicker}
          />
        )}

        {/* AFFECTS */}
        <VirraText variant="mono" size={9} color={colors.muted} style={[brk.sectionLabel, { marginTop: spacing.md }]}>
          AFFECTS
        </VirraText>
        {activeBlocks.length === 0 ? (
          <VirraText variant="mono" size={9} color={colors.muted}>Loading plans…</VirraText>
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
  inlinePicker:  { marginTop: 4, marginBottom: spacing.xs, backgroundColor: 'transparent' },
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
