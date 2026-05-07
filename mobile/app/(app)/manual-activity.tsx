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
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';

type ActivityType = 'run' | 'swim' | 'strength' | 'yoga' | 'other';

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: React.ComponentProps<typeof SymbolView>['name'] }[] = [
  { value: 'run',      label: 'Run',      icon: 'figure.run'         },
  { value: 'swim',     label: 'Swim',     icon: 'figure.pool.swim'   },
  { value: 'strength', label: 'Strength', icon: 'dumbbell'           },
  { value: 'yoga',     label: 'Yoga',     icon: 'figure.mind.and.body' },
  { value: 'other',    label: 'Other',    icon: 'figure.mixed.cardio' },
];

const DISTANCE_TYPES: ActivityType[] = ['run', 'swim'];

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
      <VirraText variant="mono" size={9} color={colors.muted} style={field.label}>{label}</VirraText>
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

  const showDistance = DISTANCE_TYPES.includes(type);

  const durationSec = parseDuration(duration);
  const distanceM   = showDistance && distance.trim()
    ? Math.round(parseFloat(distance) * 1000)
    : null;

  const canSave = !!session && !!parseDate(date) && durationSec !== null && durationSec > 0;

  async function handleSave() {
    if (!canSave || !session) return;
    const actDate = parseDate(date)!;
    setSaving(true);

    const phaseAtTime = periodStart
      ? getCycleInfo(periodStart, cycleLength ?? 28, actDate).phase
      : null;

    const startedAt = new Date(actDate);
    startedAt.setHours(9, 0, 0, 0); // default 9am when time unknown

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

    // Cancel today's training reminder if activity date is today
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
          <Pressable onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <SymbolView name="xmark" size={18} tintColor={colors.muted} />
          </Pressable>
          <VirraText variant="mono" size={10} color={colors.muted}>LOG ACTIVITY</VirraText>
          <View style={{ width: 32 }} />
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
                    onPress={() => setType(value)}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    <SymbolView name={icon} size={16} tintColor={active ? colors.mile : colors.muted} />
                    <VirraText variant="mono" size={9} color={active ? colors.mile : colors.muted}>
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
                <VirraText variant="mono" size={9} color={colors.muted}>
                  {formatDurationInput(durationSec)}
                </VirraText>
              )}
            </Field>

            {/* Distance — runs and swims only */}
            {showDistance && (
              <>
                <View style={styles.rowDivider} />
                <Field label={type === 'swim' ? 'DISTANCE (km)' : 'DISTANCE (km)'}>
                  <TextInput
                    style={styles.input}
                    value={distance}
                    onChangeText={setDistance}
                    placeholder="e.g. 5.2"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                  />
                  {durationSec && distance && parseFloat(distance) > 0 && (
                    <VirraText variant="mono" size={9} color={colors.muted}>
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
  safe:           { flex: 1, backgroundColor: colors.mile },
  header:         { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  closeBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:         { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hint:           { fontStyle: 'italic', lineHeight: 20 },
  typeRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  typeChipActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  formCard:       { gap: spacing.md },
  rowDivider:     { height: 1, backgroundColor: colors.border },
  input:          { color: colors.breath, fontFamily: fonts.mono, fontSize: 15, paddingVertical: spacing.xs },
  notesInput:     { fontFamily: fonts.body, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
});
