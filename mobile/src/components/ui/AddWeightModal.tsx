import React, { useState } from 'react';
import { Modal, View, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo, type CyclePhase } from '@/lib/cycleEngine';
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';

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
      Alert.alert('Could not save', error.message);
      return;
    }

    await recomputeBaseline(userId).catch(() => {});
    setValue('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            ADD WEIGHT
          </VirraText>
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
            <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <VirraText variant="mono" size={12} color={colors.breath}>Cancel</VirraText>
            </Pressable>
            <Pressable
              style={[styles.save, !isValid() && styles.disabled]}
              onPress={handleSave}
              accessibilityRole="button"
            >
              <VirraText variant="mono" size={12} color={colors.mile}>Save</VirraText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card:     { backgroundColor: colors.mist, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  kicker:   { letterSpacing: 1.5 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  input:    { flex: 1, color: colors.breath, fontFamily: 'BigShouldersDisplay_900Black', fontSize: 36 },
  actionRow:{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, height: 52 },
  cancel:   { flex: 1, backgroundColor: colors.mile, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  save:     { flex: 2, backgroundColor: colors.pulse, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
