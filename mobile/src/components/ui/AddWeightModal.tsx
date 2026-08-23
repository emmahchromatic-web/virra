import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraModal } from './VirraModal';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo, type CyclePhase } from '@/lib/cycleEngine';
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';
import { appAlert } from '@/components/ui/VirraAlert';

interface Props {
  visible: boolean;
  userId:  string;
  onClose: () => void;
}

export function AddWeightModal({ visible, userId, onClose }: Props) {
  const [value,  setValue]  = useState('');
  const [saving, setSaving] = useState(false);

  function isValid(): boolean {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 && n < 500;
  }

  function handleClose() {
    if (saving) return;
    setValue('');
    onClose();
  }

  async function handleSave() {
    if (!isValid() || saving) return;
    setSaving(true);
    const kg            = Math.round(parseFloat(value) * 10) / 10;
    const today         = new Date();
    const recordedOn    = today.toLocaleDateString('en-CA');
    const { periodStart, cycleLength } = useCycleStore.getState();

    let cycleDay:   number | null = null;
    let cyclePhase: CyclePhase | null = null;
    if (periodStart) {
      const info = getCycleInfo(periodStart, cycleLength, today);
      cycleDay   = info.dayOfCycle;
      cyclePhase = info.phase;
    }

    const { error } = await supabase.from('body_weights').insert({
      user_id:             userId,
      recorded_on:         recordedOn,
      weight_kg:           kg,
      source:              'manual',
      cycle_day_at_time:   cycleDay,
      cycle_phase_at_time: cyclePhase,
    });

    setSaving(false);

    if (error) {
      appAlert('Could not save', error.message);
      return;
    }

    await recomputeBaseline(userId).catch(() => {});
    setValue('');
    onClose();
  }

  return (
    <VirraModal visible={visible} onClose={handleClose} title="Add Weight">
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="kg"
          placeholderTextColor={colors.muted}
          value={value}
          onChangeText={setValue}
          autoFocus
        />
        <VirraText variant="mono" size={14} color={colors.muted}>KG</VirraText>
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.cancel} onPress={handleClose} accessibilityRole="button">
          <VirraText variant="mono" size={12} color={colors.breath}>Cancel</VirraText>
        </Pressable>
        <Pressable
          style={[styles.save, (!isValid() || saving) && styles.disabled]}
          onPress={handleSave}
          accessibilityRole="button"
        >
          <VirraText variant="mono" size={12} color={colors.mile}>
            {saving ? 'Saving…' : 'Save'}
          </VirraText>
        </Pressable>
      </View>
    </VirraModal>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  input:    { flex: 1, color: colors.breath, fontFamily: 'BigShouldersDisplay_900Black', fontSize: 36 },
  actionRow:{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, height: 52 },
  cancel:   { flex: 1, backgroundColor: colors.mile, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  save:     { flex: 2, backgroundColor: colors.pulse, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
