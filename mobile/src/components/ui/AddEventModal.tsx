import React, { useState } from 'react';
import { View, TextInput, Alert, Pressable, StyleSheet, ScrollView } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { recomputeSeasonForUser } from '@/lib/seasonEngine';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';

type DistanceGoal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra';

const DISTANCE_OPTIONS: { value: DistanceGoal; label: string }[] = [
  { value: '5k',            label: '5K'    },
  { value: '10k',           label: '10K'   },
  { value: 'half_marathon', label: 'HALF'  },
  { value: 'marathon',      label: 'MARA'  },
  { value: 'ultra',         label: 'ULTRA' },
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

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function AddEventModal({ visible, userId, onClose, onSaved }: Props) {
  const [name,         setName]         = useState('');
  const [distanceGoal, setDistanceGoal] = useState<DistanceGoal>('marathon');
  const [dateObj,      setDateObj]      = useState(() => new Date());
  const [showPicker,   setShowPicker]   = useState(false);
  const [saving,       setSaving]       = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Event name is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('user_events').insert({
      user_id:       userId,
      name:          trimmed,
      event_date:    dateObj.toLocaleDateString('en-CA'),
      distance_goal: distanceGoal,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not save event', error.message); return; }
    // Fire-and-forget: auto-create season if 2+ future events now exist
    const today = new Date().toLocaleDateString('en-CA');
    const cycleProfile = useCycleStore.getState().cycleProfile;
    recomputeSeasonForUser(userId, today, cycleProfile).catch((e) => {
      console.warn('[seasonEngine] recompute failed', e);
    });
    setName('');
    setDistanceGoal('marathon');
    setDateObj(new Date());
    onSaved();
  }

  const namePlaceholder = SHORT_RACE_PLACEHOLDER[distanceGoal] ?? 'Race, holiday, event…';

  return (
    <VirraModal visible={visible} onClose={onClose} title="Add Event">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={modal.field}>
          <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>EVENT NAME</VirraText>
          <TextInput
            style={modal.input}
            value={name}
            onChangeText={setName}
            placeholder={namePlaceholder}
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View style={[modal.field, { marginTop: spacing.md }]}>
          <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>DISTANCE</VirraText>
          <View style={modal.pillRow}>
            {DISTANCE_OPTIONS.map(({ value, label }) => (
              <Pressable
                key={value}
                style={[modal.pill, distanceGoal === value && modal.pillActive]}
                onPress={() => setDistanceGoal(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: distanceGoal === value }}
              >
                <VirraText
                  variant="mono"
                  size={9}
                  color={distanceGoal === value ? colors.mile : colors.muted}
                >
                  {label}
                </VirraText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[modal.field, { marginTop: spacing.md }]}>
          <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>DATE</VirraText>
          <Pressable style={modal.datePicker} onPress={() => setShowPicker(true)} accessibilityRole="button">
            <VirraText variant="mono" size={13} color={colors.breath}>
              {dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </VirraText>
            <SymbolView name="calendar" size={14} tintColor={colors.muted} />
          </Pressable>
          {showPicker && (
            <DateTimePicker
              value={dateObj}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              onChange={(_: DateTimePickerEvent, selected?: Date) => {
                setShowPicker(false);
                if (selected) setDateObj(selected);
              }}
            />
          )}
        </View>
      </ScrollView>

      <VirraButton label={saving ? 'Saving…' : 'Save Event'} onPress={handleSave} disabled={saving} style={{ marginTop: spacing.md }} />
      <VirraButton label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.xs }} />
    </VirraModal>
  );
}

const modal = StyleSheet.create({
  field:      { gap: spacing.xs },
  label:      { letterSpacing: 1.5 },
  input:      {
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
  datePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.mist,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pill: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mist,
  },
  pillActive: {
    backgroundColor: colors.pulse,
    borderColor: colors.pulse,
  },
});
