import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';

export interface FoodEntry {
  id:           string;
  meal_type:    string;
  food_name:    string;
  calories:     number;
  carbs_g:      number;
  protein_g:    number;
  fat_g:        number;
  fibre_g:      number;
  quantity_g:   number | null;
  source?:      'manual' | 'common' | 'off' | 'barcode' | 'haiku';
  haiku_input?: string | null;
  log_id?:      string;
}

interface Props {
  visible:  boolean;
  entry:    FoodEntry | null;
  onClose:  () => void;
  onSaved:  () => void;
}

export function FoodEntryEditModal({ visible, entry, onClose, onSaved }: Props) {
  const [gramsText, setGramsText] = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  // Derive the "base" grams value — what the stored macros represent.
  const baseGrams = entry
    ? (entry.quantity_g && entry.quantity_g > 0 ? entry.quantity_g : 100)
    : 100;

  useEffect(() => {
    if (visible && entry) {
      setGramsText(String(baseGrams));
      setError(null);
    }
  }, [visible, entry]);

  const newGrams    = parseFloat(gramsText);
  const isValidNum  = !isNaN(newGrams) && newGrams > 0 && newGrams < 5000;
  const ratio       = isValidNum ? newGrams / baseGrams : 1;
  const previewKcal = entry ? Math.round(entry.calories * ratio) : 0;

  async function handleSave() {
    if (!entry) return;

    if (!isValidNum) {
      setError('Enter a value between 1 and 4999 grams.');
      return;
    }

    setSaving(true);
    try {
      const { error: dbErr } = await supabase
        .from('food_entries')
        .update({
          quantity_g: Math.round(newGrams),
          calories:   Math.round(entry.calories  * ratio),
          carbs_g:    Math.round(entry.carbs_g   * ratio * 10) / 10,
          protein_g:  Math.round(entry.protein_g * ratio * 10) / 10,
          fat_g:      Math.round(entry.fat_g     * ratio * 10) / 10,
          fibre_g:    Math.round(entry.fibre_g   * ratio * 10) / 10,
        })
        .eq('id', entry.id);

      if (dbErr) throw dbErr;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (!entry) return null;

  const isHaiku = entry.source === 'haiku' && !!entry.haiku_input && !!entry.log_id;

  function handleReEstimate() {
    if (!entry || !entry.haiku_input || !entry.log_id) return;
    onClose();
    router.push({
      pathname: '/(app)/describe-meal',
      params: {
        logId:               entry.log_id,
        mealType:            entry.meal_type,
        prefillHaikuInput:   entry.haiku_input,
        replaceHaikuInput:   entry.haiku_input,
      },
    });
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title="EDIT PORTION">
      {/* Food name */}
      <VirraText variant="body" size={15} color={colors.breath} style={s.foodName} numberOfLines={2}>
        {entry.food_name}
      </VirraText>

      {/* Original Haiku description — read-only audit trail */}
      {isHaiku && (
        <View style={s.haikuPanel}>
          <VirraText variant="mono" size={9} color={colors.muted} style={s.haikuLabel}>
            ESTIMATED FROM
          </VirraText>
          <VirraText variant="body" size={13} color={colors.breath} style={s.haikuText}>
            &ldquo;{entry.haiku_input}&rdquo;
          </VirraText>
          <VirraButton
            label="Re-estimate this meal"
            variant="ghost"
            onPress={handleReEstimate}
            style={{ marginTop: spacing.xs }}
          />
        </View>
      )}

      {/* Grams input */}
      <View style={s.inputGroup}>
        <VirraText variant="mono" size={11} color={colors.muted} style={s.inputLabel}>
          GRAMS
        </VirraText>
        <TextInput
          style={s.input}
          value={gramsText}
          onChangeText={(t) => { setGramsText(t); setError(null); }}
          keyboardType="numeric"
          placeholder="e.g. 150"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          selectTextOnFocus
        />
      </View>

      {/* Live calorie preview */}
      <View style={s.preview}>
        <VirraText variant="mono" size={22} color={colors.pulse}>
          {isValidNum ? previewKcal : '—'}
        </VirraText>
        <VirraText variant="mono" size={11} color={colors.muted} style={s.previewUnit}>
          KCAL
        </VirraText>
      </View>

      {/* Validation error */}
      {error && (
        <VirraText variant="mono" size={10} color={colors.heat} style={s.error}>
          {error}
        </VirraText>
      )}

      <VirraButton
        label={saving ? 'Saving…' : 'SAVE'}
        onPress={handleSave}
        disabled={saving || !isValidNum}
      />
      <VirraButton
        label="Cancel"
        variant="ghost"
        onPress={onClose}
        style={{ marginTop: spacing.xs }}
      />
    </VirraModal>
  );
}

const s = StyleSheet.create({
  foodName: {
    lineHeight: 22,
  },
  haikuPanel: {
    backgroundColor:   colors.mist,
    borderRadius:      radius.md,
    padding:           spacing.md,
    borderLeftWidth:   3,
    borderLeftColor:   colors.heat,
    gap:               spacing.xs,
  },
  haikuLabel: {
    letterSpacing: 1.5,
  },
  haikuText: {
    fontStyle: 'italic',
    lineHeight: 20,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    letterSpacing: 1.5,
  },
  input: {
    backgroundColor: colors.mist,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
    color:           colors.breath,
    fontFamily:      'SpaceMono_400Regular',
    fontSize:        18,
  },
  preview: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap:            spacing.xs,
  },
  previewUnit: {
    letterSpacing: 1.5,
    marginBottom:  3,
  },
  error: {
    letterSpacing: 1,
  },
});
