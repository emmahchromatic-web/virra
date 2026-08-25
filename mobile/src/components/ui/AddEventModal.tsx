import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { recomputeSeasonForUser } from '@/lib/seasonEngine';
import { applyRaceToSchedule } from '@/lib/raceSchedule';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';
import { CalendarPicker, toLocalISO } from './CalendarPicker';
import { appAlert } from '@/components/ui/VirraAlert';

type DistanceGoal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra';

const DISTANCE_OPTIONS: { value: DistanceGoal; label: string; hint: string }[] = [
  { value: '5k',            label: '5K',            hint: 'Quick event'           },
  { value: '10k',           label: '10K',           hint: 'Short race'            },
  { value: 'half_marathon', label: 'Half Marathon', hint: '21.1 km'               },
  { value: 'marathon',      label: 'Marathon',      hint: '42.2 km'               },
  { value: 'ultra',         label: 'Ultra',         hint: 'Beyond marathon'       },
];

const SHORT_RACE_PLACEHOLDER: Partial<Record<DistanceGoal, string>> = {
  '5k':  'Quick 5K',
  '10k': 'Quick 10K',
};

interface Props {
  visible: boolean;
  userId:  string;
  onClose: () => void;
  onSaved: () => void;
}

export function AddEventModal({ visible, userId, onClose, onSaved }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [name,           setName]           = useState('');
  const [distanceGoal,   setDistanceGoal]   = useState<DistanceGoal>('marathon');
  const [dateObj,        setDateObj]        = useState<Date>(today);
  const [showDistance,   setShowDistance]   = useState(false);
  const [showDate,       setShowDate]       = useState(false);
  const [saving,         setSaving]         = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { appAlert('Event name is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('user_events').insert({
      user_id:       userId,
      name:          trimmed,
      event_date:    toLocalISO(dateObj),
      distance_goal: distanceGoal,
    });
    setSaving(false);
    if (error) { appAlert('Could not save event', error.message); return; }

    // Make the plan agree with the calendar: the run already scheduled on this
    // date becomes the race. Without this the event was a pure annotation and
    // the day kept showing whatever the template generated.
    await applyRaceToSchedule(userId, {
      event_date:    toLocalISO(dateObj),
      distance_goal: distanceGoal,
    }).catch((e) => { console.warn('[raceSchedule] apply failed', e); });

    // Fire-and-forget: auto-create season if 2+ future events now exist
    const cycleProfile = useCycleStore.getState().cycleProfile;
    recomputeSeasonForUser(userId, toLocalISO(today), cycleProfile).catch((e) => {
      console.warn('[seasonEngine] recompute failed', e);
    });
    setName('');
    setDistanceGoal('marathon');
    setDateObj(today);
    setShowDistance(false);
    setShowDate(false);
    onSaved();
  }

  const namePlaceholder = SHORT_RACE_PLACEHOLDER[distanceGoal] ?? 'Race, holiday, event…';
  const selectedDistance = DISTANCE_OPTIONS.find((o) => o.value === distanceGoal)!;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <VirraModal visible={visible} onClose={onClose} title="Add Event">
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 520 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >

        {/* EVENT NAME */}
        <VirraText variant="mono" size={11} color={colors.muted} style={s.sectionLabel}>
          EVENT NAME
        </VirraText>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder={namePlaceholder}
          placeholderTextColor={colors.muted}
          autoFocus
          returnKeyType="next"
        />

        {/* DISTANCE */}
        <VirraText variant="mono" size={11} color={colors.muted} style={[s.sectionLabel, { marginTop: spacing.md }]}>
          DISTANCE
        </VirraText>
        <Pressable
          style={[s.row, showDistance && s.rowActive]}
          onPress={() => { setShowDistance((v) => !v); setShowDate(false); }}
        >
          <VirraText variant="mono" size={13} color={colors.breath}>{selectedDistance.label.toUpperCase()}</VirraText>
          <View style={s.rowRight}>
            <VirraText variant="mono" size={11} color={colors.muted}>{selectedDistance.hint.toUpperCase()}</VirraText>
            <SymbolView
              name={showDistance ? 'chevron.up' : 'chevron.down'}
              size={13}
              tintColor={colors.pulse}
            />
          </View>
        </Pressable>
        {showDistance && (
          <View style={s.dropdown}>
            {DISTANCE_OPTIONS.map((opt, idx) => {
              const selected = opt.value === distanceGoal;
              return (
                <Pressable
                  key={opt.value}
                  style={[s.optionRow, idx > 0 && s.optionRowDivider]}
                  onPress={() => { setDistanceGoal(opt.value); setShowDistance(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={{ flex: 1 }}>
                    <VirraText variant="bodyMedium" size={14} color={selected ? colors.pulse : colors.breath}>
                      {opt.label}
                    </VirraText>
                    <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: 2, letterSpacing: 1 }}>
                      {opt.hint.toUpperCase()}
                    </VirraText>
                  </View>
                  {selected && (
                    <SymbolView name="checkmark" size={14} tintColor={colors.pulse} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* DATE */}
        <VirraText variant="mono" size={11} color={colors.muted} style={[s.sectionLabel, { marginTop: spacing.md }]}>
          DATE
        </VirraText>
        <Pressable
          style={[s.row, showDate && s.rowActive]}
          onPress={() => { setShowDate((v) => !v); setShowDistance(false); }}
        >
          <VirraText variant="mono" size={13} color={colors.breath}>{fmtDate(dateObj)}</VirraText>
          <SymbolView name="calendar" size={13} tintColor={colors.pulse} />
        </Pressable>
        {showDate && (
          <CalendarPicker
            value={dateObj}
            minDate={today}
            onSelect={(d) => { setDateObj(d); setShowDate(false); }}
          />
        )}

        <View style={{ height: spacing.md }} />
      </ScrollView>

      <VirraButton
        label={saving ? 'Saving…' : 'Save Event'}
        onPress={handleSave}
        disabled={saving}
      />
      <VirraButton label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.xs }} />
    </VirraModal>
  );
}

const s = StyleSheet.create({
  sectionLabel: { letterSpacing: 1.5, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.mist,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.breath,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingVertical:  spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor:  colors.mist,
    borderRadius:     radius.md,
    borderWidth:      1,
    borderColor:      colors.border,
  },
  rowActive:  { borderColor: colors.pulse },
  rowRight:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dropdown: {
    marginTop:        spacing.xs,
    backgroundColor:  colors.mist,
    borderRadius:     radius.md,
    borderWidth:      1,
    borderColor:      colors.border,
    overflow:         'hidden',
  },
  optionRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingVertical:  spacing.sm,
    paddingHorizontal: spacing.md,
  },
  optionRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
