import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, Pressable, TextInput, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { cancelCheckinReminderToday } from '@/lib/notifications';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { appAlert, VirraAlertHost } from '@/components/ui/VirraAlert';

const SYMPTOMS = [
  'Cramps', 'Spotting', 'Headache', 'Bloating',
  'Fatigue', 'Nausea', 'Back pain', 'Anxiety',
  'Low mood', 'Breast tenderness', 'Insomnia',
];

function RatingRow({ label, value, onChange }: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={rating.row}>
      <VirraText variant="mono" size={10} color={colors.muted} style={rating.label}>
        {label.toUpperCase()}
      </VirraText>
      <View style={rating.dots}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} style={rating.dotWrap} hitSlop={6}>
            <View style={[rating.dot, n <= value && rating.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const rating = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:     { letterSpacing: 1.5, flex: 1 },
  dots:      { flexDirection: 'row', gap: spacing.sm },
  dotWrap:   { padding: 2 },
  dot:       { width: 20, height: 20, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  dotActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
});

export default function CheckInScreen() {
  const { session } = useAuthStore();
  const { cycleInfo } = useCycleStore();

  const [energy,    setEnergy]    = useState(3);
  const [mood,      setMood]      = useState(3);
  const [sleep,     setSleep]     = useState(3);
  const [symptoms,  setSymptoms]  = useState<Set<string>>(new Set());
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    if (!session) { setLoading(false); return; }
    const today = new Date().toISOString().split('T')[0];
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('symptom_logs')
        .select('energy, mood, sleep_quality, symptoms, notes')
        .eq('user_id', session.user.id)
        .eq('recorded_on', today)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        if (typeof data.energy === 'number')        setEnergy(data.energy);
        if (typeof data.mood === 'number')          setMood(data.mood);
        if (typeof data.sleep_quality === 'number') setSleep(data.sleep_quality);
        if (Array.isArray(data.symptoms))           setSymptoms(new Set(data.symptoms));
        if (typeof data.notes === 'string')         setNotes(data.notes);
        setHasExisting(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  function toggleSymptom(s: string) {
    setSymptoms((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase.from('symptom_logs').upsert({
      user_id:       session.user.id,
      recorded_on:   new Date().toISOString().split('T')[0],
      energy,
      mood,
      sleep_quality: sleep,
      symptoms:      Array.from(symptoms),
      notes:         notes.trim() || null,
    }, { onConflict: 'user_id,recorded_on' });

    setSaving(false);
    if (error) {
      appAlert('Could not save', error.message);
    } else {
      setHasExisting(true);
      cancelCheckinReminderToday();
      router.back();
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Check-in</VirraText>
        <View style={{ width: 18 }} />
      </View>

      {cycleInfo && (
        <View style={styles.phaseBadge}>
          <VirraText variant="mono" size={11} color={colors.pulse} style={styles.badgeText}>
            DAY {cycleInfo.dayOfCycle} · {cycleInfo.phase.toUpperCase()} PHASE
          </VirraText>
        </View>
      )}

      {hasExisting && !loading && (
        <View style={styles.editingHint}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.badgeText}>
            EDITING TODAY'S CHECK-IN · LAST SAVE IS USED
          </VirraText>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.section}>
          <VirraText variant="bodyMedium" color={colors.breath} style={styles.sectionTitle}>
            How are you feeling?
          </VirraText>
          <View style={styles.ratings}>
            <RatingRow label="Energy"       value={energy} onChange={setEnergy} />
            <RatingRow label="Mood"         value={mood}   onChange={setMood}   />
            <RatingRow label="Sleep quality" value={sleep}  onChange={setSleep}  />
          </View>
        </View>

        <View style={styles.section}>
          <VirraText variant="bodyMedium" color={colors.breath} style={styles.sectionTitle}>
            Any symptoms today?
          </VirraText>
          <View style={styles.chips}>
            {SYMPTOMS.map((s) => {
              const active = symptoms.has(s);
              return (
                <Pressable
                  key={s}
                  onPress={() => toggleSymptom(s)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <VirraText variant="mono" size={11} color={active ? colors.mile : 'rgba(244,237,224,0.6)'}>
                    {s}
                  </VirraText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <VirraText variant="bodyMedium" color={colors.breath} style={styles.sectionTitle}>
            Notes
          </VirraText>
          <TextInput
            style={styles.notes}
            placeholder="Anything else worth noting..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        <VirraButton
          label={hasExisting ? 'Update check-in' : 'Save check-in'}
          onPress={handleSave}
          loading={saving}
          style={styles.cta}
        />
      </ScrollView>
      )}
      {/* This screen is presented as a native modal, so it needs its own
          alert host: the root one cannot draw over a modal screen. */}
      <VirraAlertHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  header:       { height: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg },
  backBtn:      { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  phaseBadge:   { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  editingHint:  { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  loading:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { letterSpacing: 1.5 },
  scroll:       { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  section:      { gap: spacing.md },
  sectionTitle: { marginBottom: -spacing.xs },
  ratings:      { gap: spacing.md },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip:         { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  chipActive:   { backgroundColor: colors.pulse, borderColor: colors.pulse },
  notes:        { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.body, fontSize: 14, color: colors.breath, minHeight: 100, textAlignVertical: 'top' },
  cta:          { marginTop: spacing.sm },
});
