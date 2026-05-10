import React, { useState } from 'react';
import { View, TextInput, Alert, Pressable, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';

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
  const [name,       setName]       = useState('');
  const [dateObj,    setDateObj]    = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [saving,     setSaving]     = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Event name is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('user_events').insert({
      user_id:    userId,
      name:       trimmed,
      event_date: dateObj.toLocaleDateString('en-CA'),
    });
    setSaving(false);
    if (error) { Alert.alert('Could not save event', error.message); return; }
    setName('');
    setDateObj(new Date());
    onSaved();
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title="Add Event">
      <View style={modal.field}>
        <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>EVENT NAME</VirraText>
        <TextInput
          style={modal.input}
          value={name}
          onChangeText={setName}
          placeholder="Race, holiday, event…"
          placeholderTextColor={colors.muted}
          autoFocus
          returnKeyType="next"
        />
      </View>
      <View style={modal.field}>
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
      <VirraButton label={saving ? 'Saving…' : 'Save Event'} onPress={handleSave} disabled={saving} />
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
});
