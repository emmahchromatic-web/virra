import React, { useState } from 'react';
import { View, TextInput, Alert, StyleSheet } from 'react-native';
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
  const [name,   setName]   = useState('');
  const [date,   setDate]   = useState(todayISO);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Event name is required'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Date must be YYYY-MM-DD format'); return; }
    setSaving(true);
    const { error } = await supabase.from('user_events').insert({
      user_id:    userId,
      name:       trimmed,
      event_date: date,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not save event', error.message); return; }
    setName('');
    setDate(todayISO);
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
        <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>DATE (YYYY-MM-DD)</VirraText>
        <TextInput
          style={modal.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-06-15"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
      </View>
      <VirraButton label={saving ? 'Saving…' : 'Save Event'} onPress={handleSave} disabled={saving} />
      <VirraButton label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.xs }} />
    </VirraModal>
  );
}

const modal = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { letterSpacing: 1.5 },
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
});
