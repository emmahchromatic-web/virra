import React, { useEffect, useRef, useState } from 'react';
import {
  View, TextInput, ScrollView, Pressable, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '@/lib/supabase';
import {
  searchFoods, resolveCommonFood, resolveBrandedFood, lookupBarcode,
  scaleNutrition, type NixFood,
} from '@/lib/nutritionix';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// ---- Helpers ----

function formatMacro(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

// ---- Result row ----

function FoodRow({
  food,
  onSelect,
}: {
  food:     NixFood;
  onSelect: (food: NixFood) => void;
}) {
  const isBranded = !!food.nix_item_id;
  return (
    <Pressable onPress={() => onSelect(food)} style={row.container}>
      <View style={row.body}>
        <VirraText variant="bodyMedium" size={14} color={colors.breath} >
          {food.food_name}
        </VirraText>
        {food.brand_name && (
          <VirraText variant="mono" size={9} color={colors.muted}>{food.brand_name.toUpperCase()}</VirraText>
        )}
        <VirraText variant="mono" size={9} color={colors.muted}>
          {food.serving_qty} {food.serving_unit}
          {food.serving_weight_grams > 0 ? `  ·  ${food.serving_weight_grams}g` : ''}
        </VirraText>
      </View>
      <View style={row.cals}>
        <VirraText variant="display" size={18} color={colors.pulse}>
          {Math.round(food.nf_calories)}
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
  food,
  onAdd,
  onCancel,
  adding,
}: {
  food:     NixFood;
  onAdd:    (food: NixFood, grams: number) => void;
  onCancel: () => void;
  adding:   boolean;
}) {
  const [grams, setGrams] = useState(String(food.serving_weight_grams || Math.round(food.serving_qty * 100)));
  const parsed = parseFloat(grams) || 0;
  const scaled = parsed > 0 ? scaleNutrition(food, parsed) : null;

  return (
    <VirraCard style={panel.container}>
      <VirraText variant="bodyMedium" size={15} color={colors.breath} >
        {food.food_name}
      </VirraText>
      {food.brand_name && (
        <VirraText variant="mono" size={9} color={colors.muted}>{food.brand_name.toUpperCase()}</VirraText>
      )}

      {/* Grams input */}
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

      {/* Macro preview */}
      {scaled && (
        <View style={panel.macros}>
          {[
            { label: 'KCAL',    value: scaled.calories },
            { label: 'CARBS',   value: scaled.carbs_g },
            { label: 'PROTEIN', value: scaled.protein_g },
            { label: 'FAT',     value: scaled.fat_g },
          ].map(({ label, value }) => (
            <View key={label} style={panel.macroItem}>
              <VirraText variant="display" size={16} color={colors.breath}>{formatMacro(value)}</VirraText>
              <VirraText variant="mono" size={8} color={colors.muted}>{label}</VirraText>
            </View>
          ))}
        </View>
      )}

      <View style={panel.btns}>
        <VirraButton label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <VirraButton
          label="Add"
          onPress={() => onAdd(food, parsed)}
          loading={adding}
          disabled={parsed <= 0}
          style={{ flex: 1 }}
        />
      </View>
    </VirraCard>
  );
}

const panel = StyleSheet.create({
  container: { gap: spacing.md },
  row:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel:  { width: 52, letterSpacing: 1.5 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.mile, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stepBtn:   { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input:     { flex: 1, textAlign: 'center', color: colors.breath, fontFamily: fonts.mono, fontSize: 16, paddingVertical: spacing.sm },
  macros:    { flexDirection: 'row', justifyContent: 'space-between' },
  macroItem: { alignItems: 'center', gap: 2 },
  btns:      { flexDirection: 'row', gap: spacing.sm },
});

// ---- Screen ----

export default function FoodSearchScreen() {
  const { logId, mealType } = useLocalSearchParams<{ logId: string; mealType: MealType }>();

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<NixFood[]>([]);
  const [selected, setSelected] = useState<NixFood | null>(null);
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannedRef  = useRef(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const foods = await searchFoods(query);
      setResults(foods);
      setSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function handleSelect(food: NixFood) {
    setSelected(null);
    // Resolve full nutrition if needed
    let resolved = food;
    if (!food.nix_item_id && food.nf_calories === undefined) {
      const full = await resolveCommonFood(food.food_name, food.serving_qty, food.serving_unit);
      if (full) resolved = full;
    } else if (food.nix_item_id && !food.nf_total_carbohydrate) {
      const full = await resolveBrandedFood(food.nix_item_id);
      if (full) resolved = full;
    }
    setSelected(resolved);
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanning(false);

    const food = await lookupBarcode(data);
    if (food) {
      setSelected(food);
    } else {
      Alert.alert('Not found', 'This barcode wasn\'t found in the Nutritionix database.');
      scannedRef.current = false;
    }
  }

  async function handleOpenScanner() {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Camera needed', 'Enable camera access to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setScanning(true);
  }

  async function handleAdd(food: NixFood, grams: number) {
    if (!logId) return;
    setAdding(true);
    const macros = scaleNutrition(food, grams);

    const { error } = await supabase.from('food_entries').insert({
      log_id:        logId,
      meal_type:     mealType,
      nutritionix_id: food.nix_item_id ?? food.tag_id ?? null,
      food_name:     food.food_name,
      quantity_g:    grams,
      calories:      macros.calories,
      carbs_g:       macros.carbs_g,
      protein_g:     macros.protein_g,
      fat_g:         macros.fat_g,
    });
    setAdding(false);
    if (error) {
      Alert.alert('Could not add food', error.message);
    } else {
      if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
        cancelNutritionReminderForMeal(mealType);
      }
      router.back();
    }
  }

  // ---- Camera view ----
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
          <Pressable onPress={() => setScanning(false)} style={scan.closeBtn}>
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

  // ---- Search view ----
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
            {searching && <ActivityIndicator size="small" color={colors.muted} />}
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
          {/* Add panel (selected food) */}
          {selected && (
            <AddPanel
              food={selected}
              onAdd={handleAdd}
              onCancel={() => setSelected(null)}
              adding={adding}
            />
          )}

          {/* Results */}
          {!selected && results.length > 0 && (
            <VirraCard style={styles.resultsCard}>
              {results.map((food, i) => (
                <View key={`${food.food_name}-${i}`}>
                  {i > 0 && <View style={styles.divider} />}
                  <FoodRow food={food} onSelect={handleSelect} />
                </View>
              ))}
            </VirraCard>
          )}

          {!selected && !searching && query.trim().length > 0 && results.length === 0 && (
            <VirraText variant="body" size={14} color={colors.muted} style={styles.empty}>
              No results for "{query}"
            </VirraText>
          )}

          {!selected && !query.trim() && (
            <VirraText variant="body" size={14} color={colors.muted} style={styles.empty}>
              Search by name, brand, or scan a barcode.
            </VirraText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const scan = StyleSheet.create({
  overlay:  { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  frame:    { width: 260, height: 160, borderWidth: 2, borderColor: 'rgba(212,255,38,0.8)', borderRadius: 12 },
  hint:     { marginTop: 20, letterSpacing: 1.5 },
});

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  header:      { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  closeBtn:    { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  inputWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.mist, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input:       { flex: 1, color: colors.breath, fontFamily: fonts.body, fontSize: 15, paddingVertical: 2 },
  barcodeBtn:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll:      { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  resultsCard: { gap: 0, paddingVertical: 0 },
  divider:     { height: 1, backgroundColor: colors.border },
  empty:       { textAlign: 'center', paddingTop: spacing.xl, lineHeight: 22 },
});
