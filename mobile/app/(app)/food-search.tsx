import React, { useState, useRef } from 'react';
import {
  View, TextInput, ScrollView, Pressable, StyleSheet, SafeAreaView,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { searchCommonFoods, scaleFood, type VirraFood } from '@/lib/commonFoods';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode } from '@/lib/openFoodFacts';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

function formatMacro(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

// ---- Food row ----

function FoodRow({ food, onSelect }: { food: VirraFood; onSelect: (food: VirraFood) => void }) {
  return (
    <Pressable onPress={() => onSelect(food)} style={row.container}>
      <View style={row.body}>
        <VirraText variant="bodyMedium" size={14} color={colors.breath}>{food.name}</VirraText>
        {food.detail && (
          <VirraText variant="mono" size={9} color={colors.muted}>{food.detail.toUpperCase()}</VirraText>
        )}
        <VirraText variant="mono" size={9} color={colors.muted}>per 100g</VirraText>
      </View>
      <View style={row.cals}>
        <VirraText variant="display" size={18} color={colors.pulse}>
          {food.calories}
        </VirraText>
        <VirraText variant="mono" size={8} color={colors.muted}>kcal</VirraText>
      </View>
    </Pressable>
  );
}

const row = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  body:      { flex: 1, gap: 3 },
  cals:      { alignItems: 'center', gap: 1, minWidth: 44 },
});

// ---- Add panel ----

function AddPanel({
  food, onAdd, onCancel, adding,
}: {
  food:     VirraFood;
  onAdd:    (food: VirraFood, grams: number) => void;
  onCancel: () => void;
  adding:   boolean;
}) {
  const [grams, setGrams] = useState(String(food.serving_g));
  const parsed = parseFloat(grams) || 0;
  const scaled = parsed > 0 ? scaleFood(food, parsed) : null;

  return (
    <VirraCard style={panel.container}>
      <VirraText variant="bodyMedium" size={15} color={colors.breath}>{food.name}</VirraText>
      {food.detail && (
        <VirraText variant="mono" size={9} color={colors.muted}>{food.detail.toUpperCase()}</VirraText>
      )}

      <View style={panel.row}>
        <VirraText variant="mono" size={10} color={colors.muted} style={panel.rowLabel}>GRAMS</VirraText>
        <View style={panel.inputWrap}>
          <Pressable onPress={() => setGrams(String(Math.max(1, parsed - 10)))} style={panel.stepBtn}>
            <SymbolView name="minus" size={14} tintColor={colors.breath} />
          </Pressable>
          <TextInput
            style={panel.input}
            value={grams}
            onChangeText={setGrams}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Pressable onPress={() => setGrams(String(parsed + 10))} style={panel.stepBtn}>
            <SymbolView name="plus" size={14} tintColor={colors.breath} />
          </Pressable>
        </View>
      </View>

      {scaled && (
        <View style={panel.macros}>
          {([
            { label: 'KCAL',    value: scaled.calories },
            { label: 'CARBS',   value: scaled.carbs_g },
            { label: 'PROTEIN', value: scaled.protein_g },
            { label: 'FAT',     value: scaled.fat_g },
            { label: 'FIBRE',   value: scaled.fibre_g },
          ] as const).map(({ label, value }) => (
            <View key={label} style={panel.macroItem}>
              <VirraText variant="display" size={16} color={colors.breath}>{formatMacro(value)}</VirraText>
              <VirraText variant="mono" size={8} color={colors.muted}>{label}</VirraText>
            </View>
          ))}
        </View>
      )}

      <View style={panel.btns}>
        <VirraButton label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <VirraButton label="Add" onPress={() => onAdd(food, parsed)} loading={adding} disabled={parsed <= 0} style={{ flex: 1 }} />
      </View>
    </VirraCard>
  );
}

// ---- Manual entry panel ----

interface ManualMacros {
  food_name:  string;
  calories:   string;
  carbs_g:    string;
  protein_g:  string;
  fat_g:      string;
  fibre_g:    string;
}

function ManualEntry({ onAdd, onCancel, adding }: {
  onAdd:    (macros: ManualMacros) => void;
  onCancel: () => void;
  adding:   boolean;
}) {
  const [v, setV] = useState<ManualMacros>({ food_name: '', calories: '', carbs_g: '', protein_g: '', fat_g: '', fibre_g: '' });
  const set = (key: keyof ManualMacros) => (val: string) => setV((prev) => ({ ...prev, [key]: val }));
  const canAdd = v.food_name.trim().length > 0 && parseFloat(v.calories) > 0;

  const fields: { key: keyof ManualMacros; label: string; placeholder: string }[] = [
    { key: 'food_name',  label: 'NAME',      placeholder: 'e.g. Post-run smoothie' },
    { key: 'calories',   label: 'KCAL',      placeholder: '0' },
    { key: 'carbs_g',    label: 'CARBS g',   placeholder: '0' },
    { key: 'protein_g',  label: 'PROTEIN g', placeholder: '0' },
    { key: 'fat_g',      label: 'FAT g',     placeholder: '0' },
    { key: 'fibre_g',    label: 'FIBRE g',   placeholder: '0' },
  ];

  return (
    <VirraCard style={panel.container}>
      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>LOG MANUALLY</VirraText>
      {fields.map(({ key, label, placeholder }) => (
        <View key={key} style={panel.row}>
          <VirraText variant="mono" size={9} color={colors.muted} style={panel.rowLabel}>{label}</VirraText>
          <TextInput
            style={[panel.input, panel.manualInput]}
            value={v[key]}
            onChangeText={set(key)}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            keyboardType={key === 'food_name' ? 'default' : 'decimal-pad'}
            returnKeyType="next"
          />
        </View>
      ))}
      <View style={panel.btns}>
        <VirraButton label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <VirraButton label="Add" onPress={() => onAdd(v)} loading={adding} disabled={!canAdd} style={{ flex: 1 }} />
      </View>
    </VirraCard>
  );
}

const panel = StyleSheet.create({
  container:   { gap: spacing.md },
  row:         { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel:    { width: 68, letterSpacing: 1.5 },
  inputWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.mile, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stepBtn:     { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input:       { flex: 1, textAlign: 'center', color: colors.breath, fontFamily: fonts.mono, fontSize: 16, paddingVertical: spacing.sm },
  manualInput: { textAlign: 'left', paddingHorizontal: spacing.md, flex: 1, backgroundColor: colors.mist, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  macros:      { flexDirection: 'row', justifyContent: 'space-between' },
  macroItem:   { alignItems: 'center', gap: 2 },
  btns:        { flexDirection: 'row', gap: spacing.sm },
});

// ---- Screen ----

export default function FoodSearchScreen() {
  const { logId, mealType } = useLocalSearchParams<{ logId: string; mealType: MealType }>();

  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<VirraFood | null>(null);
  const [manual,   setManual]   = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const scannedRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const results = searchCommonFoods(query);

  async function handleAdd(food: VirraFood, grams: number) {
    if (!logId) return;
    setAdding(true);
    const macros = scaleFood(food, grams);

    const { error } = await supabase.from('food_entries').insert({
      log_id:    logId,
      meal_type: mealType,
      food_name: food.name,
      quantity_g: grams,
      calories:  macros.calories,
      carbs_g:   macros.carbs_g,
      protein_g: macros.protein_g,
      fat_g:     macros.fat_g,
      fibre_g:   macros.fibre_g,
    });
    setAdding(false);
    if (error) { Alert.alert('Could not add food', error.message); return; }
    if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
      cancelNutritionReminderForMeal(mealType);
    }
    router.back();
  }

  async function handleAddManual(m: ManualMacros) {
    if (!logId) return;
    setAdding(true);

    const { error } = await supabase.from('food_entries').insert({
      log_id:    logId,
      meal_type: mealType,
      food_name: m.food_name.trim(),
      quantity_g: null,
      calories:  parseFloat(m.calories)   || 0,
      carbs_g:   parseFloat(m.carbs_g)    || 0,
      protein_g: parseFloat(m.protein_g)  || 0,
      fat_g:     parseFloat(m.fat_g)      || 0,
      fibre_g:   parseFloat(m.fibre_g)    || 0,
    });
    setAdding(false);
    if (error) { Alert.alert('Could not add food', error.message); return; }
    if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
      cancelNutritionReminderForMeal(mealType);
    }
    router.back();
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanning(false);
    setIdentifying(true);
    let food: VirraFood | null = null;
    let networkError = false;
    try {
      food = await lookupBarcode(data);
    } catch {
      networkError = true;
    }
    setIdentifying(false);
    if (food) {
      setSelected(food);
    } else {
      Alert.alert(
        networkError ? 'No connection' : 'Not found',
        networkError
          ? 'Check your internet connection and try again.'
          : 'This barcode wasn\'t recognised by Open Food Facts. Try searching by name or log manually.',
      );
      scannedRef.current = false;
    }
  }

  async function handleOpenScanner() {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Camera needed', 'Enable camera access in Settings to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setScanning(true);
  }

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <SafeAreaView style={scan.overlay}>
          <Pressable onPress={() => setScanning(false)} style={scan.closeBtn} accessibilityRole="button" accessibilityLabel="Close scanner">
            <SymbolView name="xmark" size={20} tintColor="#fff" />
          </Pressable>
          <View style={scan.frame} />
          <VirraText variant="mono" size={10} color="rgba(255,255,255,0.7)" style={scan.hint}>
            ALIGN BARCODE WITHIN FRAME
          </VirraText>
        </SafeAreaView>
      </View>
    );
  }

  if (identifying) {
    return (
      <View style={scan.identifyingScreen}>
        <ActivityIndicator size="large" color={colors.pulse} />
        <VirraText variant="mono" size={11} color="rgba(255,255,255,0.7)" style={scan.identifyingLabel}>
          IDENTIFYING...
        </VirraText>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <SymbolView name="xmark" size={18} tintColor={colors.muted} />
          </Pressable>
          <VirraText variant="mono" size={10} color={colors.muted}>
            ADD TO {(mealType ?? 'meal').toUpperCase()}
          </VirraText>
          <View style={{ width: 32 }} />
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <SymbolView name="magnifyingglass" size={16} tintColor={colors.muted} />
            <TextInput
              style={styles.input}
              placeholder="Search foods…"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
            />
          </View>
          <Pressable onPress={handleOpenScanner} style={styles.barcodeBtn} accessibilityRole="button" accessibilityLabel="Scan barcode">
            <SymbolView name="barcode.viewfinder" size={22} tintColor={colors.pulse} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Add panel (selected food from list) */}
          {selected && (
            <AddPanel
              food={selected}
              onAdd={handleAdd}
              onCancel={() => setSelected(null)}
              adding={adding}
            />
          )}

          {/* Manual entry panel */}
          {manual && !selected && (
            <ManualEntry
              onAdd={handleAddManual}
              onCancel={() => setManual(false)}
              adding={adding}
            />
          )}

          {/* Results list */}
          {!selected && !manual && (
            <>
              <VirraCard style={styles.resultsCard}>
                {results.map((food, i) => (
                  <View key={food.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <FoodRow food={food} onSelect={setSelected} />
                  </View>
                ))}
                {results.length === 0 && (
                  <VirraText variant="body" size={14} color={colors.muted} style={styles.empty}>
                    No results for "{query}"
                  </VirraText>
                )}
              </VirraCard>

              <Pressable onPress={() => setManual(true)} style={styles.manualLink} accessibilityRole="button">
                <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
                  NOT LISTED? LOG MANUALLY →
                </VirraText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const scan = StyleSheet.create({
  overlay:          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  closeBtn:         { position: 'absolute', top: 56, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  frame:            { width: 260, height: 160, borderWidth: 2, borderColor: 'rgba(212,255,38,0.8)', borderRadius: 12 },
  hint:             { marginTop: 20, letterSpacing: 1.5 },
  identifyingScreen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  identifyingLabel:  { marginTop: spacing.md, letterSpacing: 2 },
});

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  header:      { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  closeBtn:    { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  inputWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.mist, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input:       { flex: 1, color: colors.breath, fontFamily: fonts.body, fontSize: 15, paddingVertical: 2 },
  scroll:      { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  resultsCard: { gap: 0, paddingVertical: 0 },
  divider:     { height: 1, backgroundColor: colors.border },
  empty:       { textAlign: 'center', paddingVertical: spacing.md },
  manualLink:  { alignItems: 'center', paddingVertical: spacing.xs },
  barcodeBtn:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
