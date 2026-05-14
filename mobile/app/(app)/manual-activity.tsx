import React, { useState } from 'react';
import {
  View, TextInput, Pressable, ScrollView, StyleSheet, SafeAreaView,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo } from '@/lib/cycleEngine';
import { cancelTrainingReminderToday } from '@/lib/notifications';
import { linkActivityToSession } from '@/lib/scheduleGenerator';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import type { SessionType, StrengthExercise } from '@/lib/strengthTypes';

type ActivityType = 'run' | 'swim' | 'strength' | 'yoga' | 'other';

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: React.ComponentProps<typeof SymbolView>['name'] }[] = [
  { value: 'run',      label: 'Run',      icon: 'figure.run'           },
  { value: 'swim',     label: 'Swim',     icon: 'figure.pool.swim'     },
  { value: 'strength', label: 'Strength', icon: 'dumbbell'             },
  { value: 'yoga',     label: 'Yoga',     icon: 'figure.mind.and.body' },
  { value: 'other',    label: 'Other',    icon: 'figure.mixed.cardio'  },
];

const DISTANCE_TYPES: ActivityType[] = ['run', 'swim'];

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'lower',   label: 'Lower body' },
  { value: 'upper',   label: 'Upper body' },
  { value: 'general', label: 'General'    },
];

// ---- Duration parser/formatter ----

function parseDuration(input: string): number | null {
  const parts = input.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatDurationInput(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---- Date helpers ----

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function parseDate(str: string): Date | null {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

// ---- Labelled row ----

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={field.container}>
      <VirraText variant="mono" size={11} color={colors.muted} style={field.label}>{label}</VirraText>
      {children}
    </View>
  );
}

const field = StyleSheet.create({
  container: { gap: spacing.xs },
  label:     { letterSpacing: 1.5 },
});

// ---- Screen ----

export default function ManualActivityScreen() {
  const { session }                       = useAuthStore();
  const { periodStart, cycleLength }      = useCycleStore();

  const [type,     setType]     = useState<ActivityType>('run');
  const [date,     setDate]     = useState(todayISO());
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  // Strength-specific state
  const [sessionType, setSessionType] = useState<SessionType>('lower');
  const [exercises,   setExercises]   = useState<StrengthExercise[]>([]);
  const [exName,      setExName]      = useState('');
  const [exSets,      setExSets]      = useState<{ reps: string; weight: string }[]>([{ reps: '', weight: '' }]);

  const showDistance = DISTANCE_TYPES.includes(type);

  const durationSec = parseDuration(duration);
  const distanceM   = showDistance && distance.trim()
    ? Math.round(parseFloat(distance) * 1000)
    : null;

  const canSave = !!session && !!parseDate(date) && durationSec !== null && durationSec > 0;

  function handleTypeChange(newType: ActivityType) {
    setType(newType);
    if (newType !== 'strength') {
      setExercises([]);
      setExName('');
      setExSets([{ reps: '', weight: '' }]);
    }
  }

  function updateSet(idx: number, field: 'reps' | 'weight', val: string) {
    setExSets((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  }

  function addSet() {
    setExSets((prev) => [...prev, { reps: '', weight: '' }]);
  }

  function removeSet(idx: number) {
    setExSets((prev) => prev.filter((_, i) => i !== idx));
  }

  function addExercise() {
    if (!exName.trim()) {
      Alert.alert('Enter exercise name');
      return;
    }
    const validSets = exSets
      .filter((s) => s.reps.trim() && parseInt(s.reps, 10) > 0 && s.weight.trim())
      .map((s) => ({
        reps:      parseInt(s.reps, 10),
        weight_kg: parseFloat(s.weight),
      }));
    if (validSets.length === 0) {
      Alert.alert('Add at least one complete set (reps + weight)');
      return;
    }
    setExercises((prev) => [...prev, { name: exName.trim(), sets: validSets }]);
    setExName('');
    setExSets([{ reps: '', weight: '' }]);
  }

  function removeExercise(idx: number) {
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!canSave || !session) return;
    const actDate = parseDate(date)!;
    setSaving(true);

    const phaseAtTime = periodStart
      ? getCycleInfo(periodStart, cycleLength ?? 28, actDate).phase
      : null;

    const startedAt = new Date(actDate);
    startedAt.setHours(9, 0, 0, 0);

    const { data: act, error } = await supabase
      .from('activities')
      .insert({
        user_id:          session.user.id,
        activity_type:    type,
        started_at:       startedAt.toISOString(),
        duration_seconds: durationSec!,
        distance_meters:  distanceM,
        notes:            notes.trim() || null,
        phase_at_time:    phaseAtTime,
      })
      .select('id')
      .single();

    if (error) {
      Alert.alert('Could not save activity', error.message);
      setSaving(false);
      return;
    }

    if (type === 'run' && distanceM && distanceM > 0 && act?.id) {
      const distanceKm = distanceM / 1000;
      const avgPace    = distanceKm > 0 ? Math.round(durationSec! / distanceKm) : null;
      await supabase.from('run_details').insert({
        activity_id:             act.id,
        avg_pace_seconds_per_km: avgPace,
      });
    }

    if (type === 'strength' && exercises.length > 0 && act?.id) {
      const { error: detailError } = await supabase.from('strength_details').insert({
        activity_id:    act.id,
        session_type:   sessionType,
        exercises_json: exercises,
      });
      if (detailError) {
        Alert.alert('Activity saved, but exercises could not be recorded', detailError.message);
      }
    }

    try {
      if (act?.id) {
        await linkActivityToSession(
          act.id,
          session.user.id,
          date,
          type,
          type === 'strength' ? sessionType : undefined,
        );
      }
    } catch {
      // no matching planned session — that's fine
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (date === todayStr) cancelTrainingReminderToday();

    setSaving(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
          </Pressable>
          <VirraText variant="display" size={24} color={colors.pulse}>Log activity</VirraText>
          <View style={{ width: 18 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <VirraText variant="serif" size={14} color="rgba(244,237,224,0.45)" style={styles.hint}>
            Didn't have your watch? Log it here.
          </VirraText>

          {/* Activity type */}
          <Field label="ACTIVITY">
            <View style={styles.typeRow}>
              {ACTIVITY_TYPES.map(({ value, label, icon }) => {
                const active = type === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => handleTypeChange(value)}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    <SymbolView name={icon} size={16} tintColor={active ? colors.mile : colors.muted} />
                    <VirraText variant="mono" size={11} color={active ? colors.mile : colors.muted}>
                      {label.toUpperCase()}
                    </VirraText>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <VirraCard style={styles.formCard}>
            {/* Date */}
            <Field label="DATE">
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </Field>

            <View style={styles.rowDivider} />

            {/* Duration */}
            <Field label="DURATION">
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                placeholder="MM:SS or H:MM:SS"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />
              {durationSec !== null && (
                <VirraText variant="mono" size={11} color={colors.muted}>
                  {formatDurationInput(durationSec)}
                </VirraText>
              )}
            </Field>

            {/* Distance — runs and swims only */}
            {showDistance && (
              <>
                <View style={styles.rowDivider} />
                <Field label="DISTANCE (km)">
                  <TextInput
                    style={styles.input}
                    value={distance}
                    onChangeText={setDistance}
                    placeholder="e.g. 5.2"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                  />
                  {durationSec && distance && parseFloat(distance) > 0 && (
                    <VirraText variant="mono" size={11} color={colors.muted}>
                      {(() => {
                        const paceSecKm = durationSec / parseFloat(distance);
                        const m = Math.floor(paceSecKm / 60);
                        const s = Math.floor(paceSecKm % 60);
                        return `${m}:${String(s).padStart(2, '0')} /km`;
                      })()}
                    </VirraText>
                  )}
                </Field>
              </>
            )}

            <View style={styles.rowDivider} />

            {/* Notes */}
            <Field label="NOTES (OPTIONAL)">
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="How did it feel?"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
              />
            </Field>
          </VirraCard>

          {/* Strength-specific fields */}
          {type === 'strength' && (
            <>
              {/* Session type */}
              <Field label="SESSION TYPE">
                <View style={styles.sessionRow}>
                  {SESSION_TYPES.map(({ value, label }) => {
                    const active = sessionType === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setSessionType(value)}
                        style={[styles.sessionChip, active && styles.sessionChipActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                      >
                        <VirraText variant="mono" size={11} color={active ? colors.mile : colors.muted}>
                          {label.toUpperCase()}
                        </VirraText>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              {/* Logged exercises */}
              {exercises.length > 0 && (
                <VirraCard style={styles.formCard}>
                  <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>
                    EXERCISES
                  </VirraText>
                  {exercises.map((ex, idx) => (
                    <View key={idx} style={styles.exerciseItem}>
                      <View style={styles.exerciseItemHeader}>
                        <VirraText variant="bodyMedium" size={14} color={colors.breath}>{ex.name}</VirraText>
                        <Pressable onPress={() => removeExercise(idx)} hitSlop={8}>
                          <SymbolView name="xmark.circle" size={16} tintColor={colors.muted} />
                        </Pressable>
                      </View>
                      <VirraText variant="mono" size={10} color={colors.muted}>
                        {ex.sets.map((s) => `${s.reps} × ${s.weight_kg}kg`).join('  ·  ')}
                      </VirraText>
                    </View>
                  ))}
                </VirraCard>
              )}

              {/* Exercise builder */}
              <VirraCard style={styles.formCard}>
                <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>
                  ADD EXERCISE
                </VirraText>

                <TextInput
                  style={styles.input}
                  value={exName}
                  onChangeText={setExName}
                  placeholder="Exercise name"
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                />

                <View style={styles.rowDivider} />

                {/* Set header */}
                <View style={styles.setHeader}>
                  <VirraText variant="mono" size={11} color={colors.muted} style={styles.setColReps}>REPS</VirraText>
                  <VirraText variant="mono" size={11} color={colors.muted} style={styles.setColWeight}>KG</VirraText>
                  <View style={styles.setColRemove} />
                </View>

                {exSets.map((s, idx) => (
                  <View key={idx} style={styles.setRow}>
                    <TextInput
                      style={[styles.input, styles.setColReps]}
                      value={s.reps}
                      onChangeText={(v) => updateSet(idx, 'reps', v)}
                      placeholder="10"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                    />
                    <TextInput
                      style={[styles.input, styles.setColWeight]}
                      value={s.weight}
                      onChangeText={(v) => updateSet(idx, 'weight', v)}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                    />
                    <Pressable
                      style={styles.setColRemove}
                      onPress={() => exSets.length > 1 ? removeSet(idx) : null}
                      hitSlop={8}
                    >
                      {exSets.length > 1 && (
                        <SymbolView name="minus.circle" size={16} tintColor={colors.muted} />
                      )}
                    </Pressable>
                  </View>
                ))}

                <Pressable onPress={addSet} style={styles.addSetBtn}>
                  <SymbolView name="plus" size={12} tintColor={colors.pulse} />
                  <VirraText variant="mono" size={10} color={colors.pulse}>ADD SET</VirraText>
                </Pressable>

                <View style={styles.rowDivider} />

                <Pressable onPress={addExercise} style={styles.addExBtn}>
                  <SymbolView name="checkmark" size={14} tintColor={colors.mile} />
                  <VirraText variant="mono" size={10} color={colors.mile}>ADD EXERCISE</VirraText>
                </Pressable>
              </VirraCard>
            </>
          )}

          <VirraButton
            label="Save activity"
            onPress={handleSave}
            loading={saving}
            disabled={!canSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: colors.mile },
  header:             { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  backBtn:            { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  closeBtn:           { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:             { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hint:               { fontStyle: 'italic', lineHeight: 20 },
  typeRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  typeChipActive:     { backgroundColor: colors.pulse, borderColor: colors.pulse },
  formCard:           { gap: spacing.md },
  rowDivider:         { height: 1, backgroundColor: colors.border },
  input:              { color: colors.breath, fontFamily: fonts.mono, fontSize: 15, paddingVertical: spacing.xs },
  notesInput:         { fontFamily: fonts.body, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  sessionRow:         { flexDirection: 'row', gap: spacing.sm },
  sessionChip:        { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  sessionChipActive:  { backgroundColor: colors.pulse, borderColor: colors.pulse },
  exerciseItem:       { gap: 3 },
  exerciseItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setHeader:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setRow:             { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setColReps:         { flex: 1 },
  setColWeight:       { flex: 1 },
  setColRemove:       { width: 24, alignItems: 'center' },
  addSetBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addExBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.pulse, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
