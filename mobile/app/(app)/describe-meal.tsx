import React, { useState, useRef } from 'react';
import {
  View, TextInput, ScrollView, Pressable, StyleSheet, SafeAreaView,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface EstimateItem {
  food_name:  string;
  quantity_g: number;
  calories:   number;
  carbs_g:    number;
  protein_g:  number;
  fat_g:      number;
  fibre_g:    number;
  confidence: number;
}

interface EstimateResponse {
  items:              EstimateItem[];
  overall_confidence: number;
  notes:              string | null;
  error?:             'parse_failed';
}

function confidenceColor(c: number): string {
  if (c >= 0.7) return colors.pulse;
  if (c >= 0.4) return colors.dawn;
  return colors.heat;
}

// supabase-js wraps non-2xx responses in FunctionsHttpError with the raw Response
// on `error.context`. Our edge function returns `{ error: "<copy>" }` for known
// failure modes (rate limit, bad request, etc.) — surface that string rather than
// the SDK's generic "Failed to send a request to the Edge Function".
async function extractEdgeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response | undefined })?.context;
  if (ctx && typeof ctx === 'object' && 'status' in ctx && typeof (ctx as Response).json === 'function') {
    const res = ctx as Response;
    try {
      const body = await res.clone().json() as { error?: unknown };
      if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
    } catch { /* body wasn't JSON — fall through */ }
    if (res.status === 429) {
      return 'Too many estimates in the last minute. Wait a moment and try again.';
    }
    if (res.status >= 500) {
      return 'Our estimator is having a moment. Try again shortly, or log this one manually.';
    }
  }
  return 'We couldn\'t reach our estimator. Check your connection and try again, or log this one manually.';
}

function formatMacro(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

// ---- Editable item row ----

function ItemRow({
  item, onChange, onDelete,
}: {
  item:     EstimateItem;
  onChange: (next: EstimateItem) => void;
  onDelete: () => void;
}) {
  // Track each numeric field as a string so the user can clear/edit freely;
  // on blur we coerce back to numbers.
  const [draft, setDraft] = useState({
    food_name:  item.food_name,
    quantity_g: String(item.quantity_g),
    calories:   String(item.calories),
    carbs_g:    String(item.carbs_g),
    protein_g:  String(item.protein_g),
    fat_g:      String(item.fat_g),
    fibre_g:    String(item.fibre_g),
  });

  function commitNumber(key: keyof typeof draft, val: string) {
    const next = { ...draft, [key]: val };
    setDraft(next);
    onChange({
      ...item,
      food_name:  next.food_name.trim() || item.food_name,
      quantity_g: parseFloat(next.quantity_g) || 0,
      calories:   parseFloat(next.calories)   || 0,
      carbs_g:    parseFloat(next.carbs_g)    || 0,
      protein_g:  parseFloat(next.protein_g)  || 0,
      fat_g:      parseFloat(next.fat_g)      || 0,
      fibre_g:    parseFloat(next.fibre_g)    || 0,
    });
  }

  function commitName(val: string) {
    const next = { ...draft, food_name: val };
    setDraft(next);
    onChange({ ...item, food_name: val.trim() });
  }

  return (
    <VirraCard style={itemRow.card}>
      <View style={itemRow.header}>
        <View style={[itemRow.confDot, { backgroundColor: confidenceColor(item.confidence) }]} />
        <TextInput
          style={itemRow.nameInput}
          value={draft.food_name}
          onChangeText={commitName}
          placeholderTextColor={colors.muted}
        />
        <View style={itemRow.estChip}>
          <VirraText variant="mono" size={9} color={colors.breath} style={itemRow.estChipLabel}>EST.</VirraText>
        </View>
        <Pressable onPress={onDelete} hitSlop={8} style={itemRow.deleteBtn} accessibilityRole="button" accessibilityLabel="Remove item">
          <SymbolView name="xmark" size={14} tintColor={colors.muted} />
        </Pressable>
      </View>

      <View style={itemRow.grid}>
        {([
          { key: 'quantity_g', label: 'GRAMS' },
          { key: 'calories',   label: 'KCAL' },
          { key: 'carbs_g',    label: 'CARBS' },
          { key: 'protein_g',  label: 'PROTEIN' },
          { key: 'fat_g',      label: 'FAT' },
          { key: 'fibre_g',    label: 'FIBRE' },
        ] as const).map(({ key, label }) => (
          <View key={key} style={itemRow.cell}>
            <VirraText variant="mono" size={9} color={colors.muted} style={itemRow.cellLabel}>{label}</VirraText>
            <TextInput
              style={itemRow.macroInput}
              value={draft[key]}
              onChangeText={(v) => commitNumber(key, v)}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
          </View>
        ))}
      </View>
    </VirraCard>
  );
}

const itemRow = StyleSheet.create({
  card:         { gap: spacing.sm },
  header:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confDot:      { width: 10, height: 10, borderRadius: 5 },
  nameInput:    { flex: 1, color: colors.breath, fontFamily: fonts.body, fontSize: 15, paddingVertical: 2 },
  estChip:      { backgroundColor: colors.heat, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  estChipLabel: { letterSpacing: 1.5 },
  deleteBtn:    { padding: 4 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell:         { width: '30%', gap: 2 },
  cellLabel:    { letterSpacing: 1.2 },
  macroInput:   { color: colors.breath, fontFamily: fonts.mono, fontSize: 14, backgroundColor: colors.mile, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'center' },
});

// ---- Disclosure fact row ----

function DisclosureFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={discFact.row}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={discFact.label}>{label}</VirraText>
      <VirraText variant="body" size={13} color={colors.breath}>{value}</VirraText>
    </View>
  );
}

const discFact = StyleSheet.create({
  row:   { gap: 4 },
  label: { letterSpacing: 1.5 },
});

// ---- Screen ----

export default function DescribeMealScreen() {
  const { logId, mealType, prefillHaikuInput, replaceHaikuInput } = useLocalSearchParams<{
    logId:              string;
    mealType:           MealType;
    prefillHaikuInput?: string;
    replaceHaikuInput?: string;
  }>();
  const userId                            = useAuthStore((s) => s.user?.id);
  const disclosureAckAt                   = useProfileStore((s) => s.haikuDisclosureAcknowledgedAt);
  const acknowledgeHaikuDisclosure        = useProfileStore((s) => s.acknowledgeHaikuDisclosure);

  const [description, setDescription] = useState(prefillHaikuInput ?? '');
  const [estimating, setEstimating]   = useState(false);
  const [items, setItems]             = useState<EstimateItem[] | null>(null);
  const [notes, setNotes]             = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const inputRef                      = useRef<TextInput | null>(null);
  const showDisclosure                = !disclosureAckAt;
  const isReplaceMode                 = !!replaceHaikuInput;

  async function handleAcknowledge() {
    if (userId) await acknowledgeHaikuDisclosure(userId);
  }

  async function handleEstimate() {
    const trimmed = description.trim();
    if (trimmed.length < 3) {
      Alert.alert('Add a description', 'Tell us what you ate so we can estimate.');
      return;
    }
    setEstimating(true);
    try {
      const { data, error } = await supabase.functions.invoke<EstimateResponse>('estimate-meal', {
        // Re-estimate path bypasses cache — otherwise an unchanged description would
        // return identical numbers, which defeats the "look at this with fresh eyes" intent.
        body: { description: trimmed, force_refresh: isReplaceMode },
      });
      if (error) {
        // supabase-js's error.message is unhelpful ("Failed to send a request to the Edge Function").
        // For HTTP error responses the JSON body is on error.context — pull out our own copy if present.
        const friendly = await extractEdgeError(error);
        Alert.alert('Couldn\'t estimate this', friendly);
        return;
      }
      if (!data || data.error === 'parse_failed' || data.items.length === 0) {
        Alert.alert(
          'Couldn\'t estimate this',
          data?.notes ?? 'Try describing the meal with a bit more detail, or log it manually.',
        );
        return;
      }
      setItems(data.items);
      setNotes(data.notes);
    } catch {
      Alert.alert(
        'Couldn\'t estimate this',
        'Something went wrong on our side. Try again in a moment, or log this one manually.',
      );
    } finally {
      setEstimating(false);
    }
  }

  async function handleSaveAll() {
    if (!logId || !items || items.length === 0) return;
    setSaving(true);
    const haikuInput = description.trim();

    // Replace mode: wipe the prior rows from this same description on this log
    // before inserting the new estimate. A failed delete is non-fatal — we
    // continue to insert; user can hand-delete duplicates if it matters.
    if (isReplaceMode && replaceHaikuInput) {
      const { error: delErr } = await supabase
        .from('food_entries')
        .delete()
        .eq('log_id', logId)
        .eq('haiku_input', replaceHaikuInput);
      if (delErr) console.warn('[describe-meal] failed to remove prior haiku rows:', delErr.message);
    }

    const rows = items.map((item) => ({
      log_id:      logId,
      meal_type:   mealType,
      food_name:   item.food_name,
      quantity_g:  item.quantity_g,
      calories:    item.calories,
      carbs_g:     item.carbs_g,
      protein_g:   item.protein_g,
      fat_g:       item.fat_g,
      fibre_g:     item.fibre_g,
      source:      'haiku',
      confidence:  item.confidence,
      haiku_input: haikuInput,
    }));
    const { error } = await supabase.from('food_entries').insert(rows);
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
      cancelNutritionReminderForMeal(mealType);
    }
    router.back();
  }

  function handleRetry() {
    setItems(null);
    setNotes(null);
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
          <VirraText variant="mono" size={10} color={colors.muted}>
            {isReplaceMode ? 'RE-ESTIMATE' : 'DESCRIBE MEAL'} · {(mealType ?? 'meal').toUpperCase()}
          </VirraText>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showDisclosure ? (
            <>
              <VirraCard style={styles.disclosureCard}>
                <View style={styles.disclosureIcon}>
                  <SymbolView name="sparkles" size={22} tintColor={colors.pulse} />
                </View>
                <VirraText variant="display" size={26} color={colors.breath}>
                  ABOUT THIS ESTIMATOR
                </VirraText>
                <VirraText variant="body" size={14} color={colors.breath} style={styles.disclosureLead}>
                  We send your meal description to Anthropic&apos;s Claude AI, which estimates the
                  macros and calories. Estimates are educated guesses; you can edit any value
                  before saving.
                </VirraText>

                <View style={styles.disclosureFacts}>
                  <DisclosureFact label="WHAT WE SEND"     value="Only the words you type. Nothing else." />
                  <DisclosureFact label="WHAT WE STORE"    value="The description and the result, on your account." />
                  <DisclosureFact label="WHAT WE NEVER SEND" value="Your name, email, cycle data, or health history." />
                </View>

                <VirraText variant="mono" size={10} color={colors.muted} style={styles.disclosureFootnote}>
                  YOU&apos;LL ONLY SEE THIS ONCE
                </VirraText>
              </VirraCard>

              <VirraButton
                label="I understand"
                onPress={handleAcknowledge}
                disabled={!userId}
              />
            </>
          ) : !items ? (
            <>
              <VirraCard style={styles.inputCard}>
                <VirraText variant="mono" size={10} color={colors.muted} style={styles.inputLabel}>
                  WHAT DID YOU EAT?
                </VirraText>
                <TextInput
                  ref={inputRef}
                  style={styles.bigInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Pulled pork BBQ burger with chips and a Diet Coke"
                  placeholderTextColor={colors.muted}
                  multiline
                  autoFocus
                  maxLength={500}
                  returnKeyType="default"
                />

                <View style={styles.inputFooter}>
                  <Pressable
                    onPress={() => inputRef.current?.focus()}
                    style={styles.micBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Speak the description"
                    accessibilityHint="Focuses the input so you can tap the microphone on the keyboard to dictate"
                    hitSlop={8}
                  >
                    <SymbolView name="mic.fill" size={13} tintColor={colors.pulse} />
                    <VirraText variant="mono" size={10} color={colors.pulse} style={styles.micLabel}>
                      SPEAK IT
                    </VirraText>
                  </Pressable>
                  <VirraText variant="mono" size={10} color={colors.muted} style={styles.hint}>
                    {description.length}/500 · ESTIMATES ONLY
                  </VirraText>
                </View>
              </VirraCard>

              <VirraButton
                label={estimating ? 'Estimating…' : 'Estimate'}
                onPress={handleEstimate}
                loading={estimating}
                disabled={estimating || description.trim().length < 3}
              />
            </>
          ) : (
            <>
              {notes && (
                <View style={styles.notes}>
                  <VirraText variant="mono" size={10} color={colors.dawn} style={styles.notesLabel}>NOTE</VirraText>
                  <VirraText variant="body" size={13} color={colors.breath}>{notes}</VirraText>
                </View>
              )}

              {items.map((item, i) => (
                <ItemRow
                  key={`${i}-${item.food_name}`}
                  item={item}
                  onChange={(next) => {
                    setItems((prev) => prev?.map((p, idx) => idx === i ? next : p) ?? null);
                  }}
                  onDelete={() => {
                    setItems((prev) => prev?.filter((_, idx) => idx !== i) ?? null);
                  }}
                />
              ))}

              <View style={styles.actionRow}>
                <VirraButton label="Try again" variant="ghost" onPress={handleRetry} style={{ flex: 1 }} />
                <VirraButton
                  label={
                    isReplaceMode
                      ? `Replace with ${items.length} ${items.length === 1 ? 'item' : 'items'}`
                      : `Save ${items.length} ${items.length === 1 ? 'item' : 'items'}`
                  }
                  onPress={handleSaveAll}
                  loading={saving}
                  disabled={saving || items.length === 0}
                  style={{ flex: 1.5 }}
                />
              </View>
            </>
          )}

          {estimating && (
            <View style={styles.estimatingHint}>
              <ActivityIndicator size="small" color={colors.muted} />
              <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.sm, letterSpacing: 1.5 }}>
                READING THE PLATE…
              </VirraText>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.mile },
  header:         { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  closeBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:         { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  inputCard:      { gap: spacing.sm },
  inputLabel:     { letterSpacing: 1.5 },
  bigInput:       { minHeight: 96, color: colors.breath, fontFamily: fonts.serif, fontSize: 16, lineHeight: 22, backgroundColor: colors.mile, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, textAlignVertical: 'top' },
  inputFooter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  micBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  micLabel:       { letterSpacing: 1.5 },
  hint:           { letterSpacing: 1.2, flexShrink: 1, textAlign: 'right' },
  notes:               { backgroundColor: colors.mist, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.dawn, gap: spacing.xs },
  notesLabel:          { letterSpacing: 1.5 },
  actionRow:           { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  estimatingHint:      { alignItems: 'center', paddingVertical: spacing.lg },
  disclosureCard:      { gap: spacing.md, paddingVertical: spacing.lg },
  disclosureIcon:      { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mile, alignItems: 'center', justifyContent: 'center' },
  disclosureLead:      { lineHeight: 20 },
  disclosureFacts:     { gap: spacing.md, marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  disclosureFootnote:  { letterSpacing: 1.5, textAlign: 'center', marginTop: spacing.xs },
});
