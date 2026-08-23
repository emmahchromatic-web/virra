import React, { useState, useRef, useEffect } from 'react';
import {
  View, TextInput, ScrollView, Pressable, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { searchCommonFoods, scaleFood, type VirraFood } from '@/lib/commonFoods';
import { foodUnit, per100Label, unitInputLabel, inferUnitFromName, type FoodUnit } from '@/lib/foodUnits';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode, searchByName } from '@/lib/openFoodFacts';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { appAlert } from '@/components/ui/VirraAlert';

interface FavouriteEntry {
  food_name:     string;
  quantity_unit: string | null;
  quantity_g: number | null;
  calories:   number;
  carbs_g:    number;
  protein_g:  number;
  fat_g:      number;
  fibre_g:    number;
  count:      number;
}

interface MealCombo {
  id:           string;
  name:         string;
  meal_type:    string;
  items_json:   Array<{
    food_name:  string;
    quantity_g: number | null;
    quantity_unit?: FoodUnit | null;
    calories:   number;
    carbs_g:    number;
    protein_g:  number;
    fat_g:      number;
    fibre_g:    number;
  }>;
  last_used_at: string | null;
}

function entryToVirraFood(fav: FavouriteEntry): VirraFood {
  const g = fav.quantity_g ?? 100;
  const scale = g > 0 ? 100 / g : 1;
  return {
    id:        `fav-${fav.food_name}`,
    name:      fav.food_name,
    // Rows logged before quantity_unit existed have no stored unit, so fall
    // back to the name rather than silently calling a past pint 500 grams.
    unit:      fav.quantity_unit === 'ml' ? 'ml' : inferUnitFromName(fav.food_name),
    serving_g: g,
    calories:  Math.round(fav.calories  * scale),
    carbs_g:   Math.round(fav.carbs_g   * scale * 10) / 10,
    protein_g: Math.round(fav.protein_g * scale * 10) / 10,
    fat_g:     Math.round(fav.fat_g     * scale * 10) / 10,
    fibre_g:   Math.round((fav.fibre_g ?? 0) * scale * 10) / 10,
  };
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'BREAKFAST', lunch: 'LUNCH', dinner: 'DINNER', snack: 'SNACK',
};

function formatMacro(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

// ---- Food row ----

function FoodRow({ food, onSelect, showOffChip }: {
  food: VirraFood;
  onSelect: (food: VirraFood) => void;
  showOffChip?: boolean;
}) {
  return (
    <Pressable onPress={() => onSelect(food)} style={row.container}>
      <View style={row.body}>
        <View style={row.nameLine}>
          <VirraText variant="bodyMedium" size={14} color={colors.breath} style={row.name}>{food.name}</VirraText>
          {showOffChip && (
            <View style={row.offChip}>
              <VirraText variant="mono" size={9} color={colors.mile} style={row.offChipLabel}>OFF</VirraText>
            </View>
          )}
        </View>
        {food.detail && (
          <VirraText variant="mono" size={11} color={colors.muted}>{food.detail.toUpperCase()}</VirraText>
        )}
        <VirraText variant="mono" size={11} color={colors.muted}>{per100Label(foodUnit(food))}</VirraText>
      </View>
      <View style={row.cals}>
        <VirraText variant="display" size={18} color={colors.pulse}>
          {food.calories}
        </VirraText>
        <VirraText variant="mono" size={10} color={colors.muted}>kcal</VirraText>
      </View>
    </Pressable>
  );
}

const row = StyleSheet.create({
  container:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  body:         { flex: 1, gap: 3 },
  nameLine:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name:         { flexShrink: 1 },
  offChip:      { backgroundColor: colors.breath, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  offChipLabel: { letterSpacing: 1.2 },
  cals:         { alignItems: 'center', gap: 1, minWidth: 44 },
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
  const unit   = foodUnit(food);
  const [grams, setGrams] = useState(String(food.serving_g));
  const parsed = parseFloat(grams) || 0;
  const scaled = parsed > 0 ? scaleFood(food, parsed) : null;

  return (
    <VirraCard style={panel.container}>
      <VirraText variant="bodyMedium" size={15} color={colors.breath}>{food.name}</VirraText>
      {food.detail && (
        <VirraText variant="mono" size={11} color={colors.muted}>{food.detail.toUpperCase()}</VirraText>
      )}

      <View style={panel.row}>
        <VirraText variant="mono" size={10} color={colors.muted} style={panel.rowLabel}>{unitInputLabel(unit)}</VirraText>
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
              <VirraText variant="mono" size={10} color={colors.muted}>{label}</VirraText>
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
          <VirraText variant="mono" size={11} color={colors.muted} style={panel.rowLabel}>{label}</VirraText>
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
  // The route seeds the meal from the time of day (defaultMealSlot); the user can
  // change it here, so it's state, not a fixed prop.
  const [activeMeal, setActiveMeal] = useState<MealType>(mealType ?? 'snack');

  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<VirraFood | null>(null);
  const [selectedFromBarcode, setSelectedFromBarcode] = useState(false);
  const [manual,   setManual]   = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const scannedRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [remoteResults, setRemoteResults]     = useState<VirraFood[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [favourites, setFavourites] = useState<FavouriteEntry[]>([]);
  const [combos,     setCombos]     = useState<MealCombo[]>([]);

  const localResults = searchCommonFoods(query, activeMeal);

  useEffect(() => {
    if (!activeMeal) return;
    // Fetch history for YOUR REGULARS
    supabase
      .from('food_entries')
      .select('food_name, quantity_g, quantity_unit, calories, carbs_g, protein_g, fat_g, fibre_g')
      .eq('meal_type', activeMeal)
      .order('id', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Map<string, FavouriteEntry>();
        for (const e of data) {
          const existing = seen.get(e.food_name);
          if (existing) {
            existing.count++;
          } else {
            seen.set(e.food_name, { ...e, fibre_g: e.fibre_g ?? 0, count: 1 });
          }
        }
        const sorted = Array.from(seen.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setFavourites(seen.size >= 2 ? sorted : []);
      });
    // Fetch MY MEALS combos
    supabase
      .from('meal_combos')
      .select('id, name, meal_type, items_json, last_used_at')
      .eq('meal_type', activeMeal)
      .order('last_used_at', { ascending: false })
      .then(({ data }) => setCombos((data as MealCombo[]) ?? []));
  }, [activeMeal]);

  // Wrapper used by the list rows; picking from the list resets the barcode-source flag.
  const handleListSelect = (food: VirraFood) => {
    setSelectedFromBarcode(false);
    setSelected(food);
  };
  const handleSelectionCancel = () => {
    setSelectedFromBarcode(false);
    setSelected(null);
  };

  // OFF remote search: debounced 300ms, triggers when query is meaningfully long
  // AND local matches are sparse. AbortController cancels stale requests.
  useEffect(() => {
    abortRef.current?.abort();
    const q = query.trim();
    if (q.length < 3 || localResults.length >= 5) {
      setRemoteResults([]);
      setRemoteSearching(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRemoteSearching(true);
    const timer = setTimeout(() => {
      searchByName(q, { signal: ctrl.signal })
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setRemoteResults(res);
          setRemoteSearching(false);
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
          setRemoteResults([]);
          setRemoteSearching(false);
        });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // localResults.length is derived from query; query alone is the right dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleAdd(food: VirraFood, grams: number) {
    if (!logId) return;
    setAdding(true);
    const macros = scaleFood(food, grams);
    // Repurpose the legacy `nutritionix_id` column as the OFF barcode/id, per CLAUDE.md.
    const isOff   = food.id.startsWith('off-');
    const offCode = isOff ? food.id.slice(4) : null;
    const source  = selectedFromBarcode ? 'barcode' : isOff ? 'off' : 'common';

    const { error } = await supabase.from('food_entries').insert({
      log_id:    logId,
      meal_type: activeMeal,
      food_name: food.name,
      quantity_g: grams,
      quantity_unit: foodUnit(food),
      calories:  macros.calories,
      carbs_g:   macros.carbs_g,
      protein_g: macros.protein_g,
      fat_g:     macros.fat_g,
      fibre_g:   macros.fibre_g,
      nutritionix_id: offCode,
      source,
    });
    setAdding(false);
    if (error) { appAlert('Could not add food', error.message); return; }
    if (activeMeal === 'breakfast' || activeMeal === 'lunch' || activeMeal === 'dinner') {
      cancelNutritionReminderForMeal(activeMeal);
    }
    router.back();
  }

  async function handleAddManual(m: ManualMacros) {
    if (!logId) return;
    setAdding(true);

    const { error } = await supabase.from('food_entries').insert({
      log_id:    logId,
      meal_type: activeMeal,
      food_name: m.food_name.trim(),
      quantity_g: null,
      calories:  parseFloat(m.calories)   || 0,
      carbs_g:   parseFloat(m.carbs_g)    || 0,
      protein_g: parseFloat(m.protein_g)  || 0,
      fat_g:     parseFloat(m.fat_g)      || 0,
      fibre_g:   parseFloat(m.fibre_g)    || 0,
      source:    'manual',
    });
    setAdding(false);
    if (error) { appAlert('Could not add food', error.message); return; }
    if (activeMeal === 'breakfast' || activeMeal === 'lunch' || activeMeal === 'dinner') {
      cancelNutritionReminderForMeal(activeMeal);
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
      setSelectedFromBarcode(true);
      setSelected(food);
    } else {
      appAlert(
        networkError ? 'No connection' : 'Not found',
        networkError
          ? 'Check your internet connection and try again.'
          : 'This barcode wasn\'t recognised. Try searching by name or log manually.',
      );
      scannedRef.current = false;
    }
  }

  async function handleAddCombo(combo: MealCombo) {
    if (!logId) return;
    setAdding(true);
    const rows = combo.items_json.map((item) => ({
      log_id:    logId,
      meal_type: activeMeal,
      food_name: item.food_name,
      quantity_g: item.quantity_g,
      quantity_unit: item.quantity_unit ?? 'g',
      calories:  item.calories,
      carbs_g:   item.carbs_g,
      protein_g: item.protein_g,
      fat_g:     item.fat_g,
      fibre_g:   item.fibre_g ?? 0,
      source:    'manual' as const,
    }));
    const { error } = await supabase.from('food_entries').insert(rows);
    setAdding(false);
    if (!error) {
      supabase.from('meal_combos').update({ last_used_at: new Date().toISOString() }).eq('id', combo.id).then(() => {});
      if (activeMeal === 'breakfast' || activeMeal === 'lunch' || activeMeal === 'dinner') {
        cancelNutritionReminderForMeal(activeMeal);
      }
      router.back();
    } else {
      appAlert('Could not add meal', error.message);
    }
  }

  async function handleOpenScanner() {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        appAlert('Camera needed', 'Enable camera access in Settings to scan barcodes.');
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
          Identifying...
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
            LOG FOOD
          </VirraText>
          <View style={{ width: 32 }} />
        </View>

        {/* Meal selector: seeded from the time of day, changeable here */}
        <View style={styles.mealTabs}>
          {MEAL_ORDER.map((m) => {
            const active = m === activeMeal;
            return (
              <Pressable
                key={m}
                onPress={() => setActiveMeal(m)}
                style={[styles.mealTab, active && styles.mealTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Log to ${m}`}
              >
                <VirraText variant="mono" size={10} color={active ? colors.mile : colors.muted}>
                  {MEAL_LABEL[m]}
                </VirraText>
              </Pressable>
            );
          })}
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
              onCancel={handleSelectionCancel}
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
              {/* MY MEALS: saved combos for this meal type */}
              {combos.length > 0 && query.trim().length === 0 && (
                <>
                  <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
                    MY MEALS
                  </VirraText>
                  <VirraCard style={styles.resultsCard}>
                    {combos.map((combo, i) => {
                      const totalKcal = Math.round(combo.items_json.reduce((sum, item) => sum + item.calories, 0));
                      return (
                        <View key={combo.id}>
                          {i > 0 && <View style={styles.divider} />}
                          <Pressable
                            onPress={() => handleAddCombo(combo)}
                            style={({ pressed }) => [qk.comboRow, pressed && { opacity: 0.7 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${combo.name}`}
                          >
                            <VirraText variant="bodyMedium" size={14} color={colors.breath} style={{ flex: 1 }}>
                              {combo.name}
                            </VirraText>
                            <View style={qk.comboRight}>
                              <VirraText variant="display" size={16} color={colors.pulse}>{totalKcal}</VirraText>
                              <VirraText variant="mono" size={10} color={colors.muted}>
                                kcal · {combo.items_json.length} items
                              </VirraText>
                            </View>
                          </Pressable>
                        </View>
                      );
                    })}
                  </VirraCard>
                </>
              )}

              {/* YOUR REGULARS: top 5 auto-favourites */}
              {favourites.length > 0 && query.trim().length === 0 && (
                <>
                  <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
                    YOUR REGULARS
                  </VirraText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={qk.pillRow}>
                    {favourites.map((fav) => {
                      const kcal = Math.round(fav.calories);
                      return (
                        <Pressable
                          key={fav.food_name}
                          onPress={() => handleListSelect(entryToVirraFood(fav))}
                          style={({ pressed }) => [qk.pill, pressed && { opacity: 0.7 }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${fav.food_name}`}
                        >
                          <VirraText variant="body" size={13} color={colors.breath} numberOfLines={1}>
                            {fav.food_name}
                          </VirraText>
                          <VirraText variant="mono" size={10} color={colors.muted}>
                            {kcal} kcal
                          </VirraText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Action row: peer affordances to search */}
              <View style={styles.actionRow}>
                <VirraButton
                  label="Describe a meal"
                  variant="primary"
                  onPress={() => router.push({ pathname: '/(app)/describe-meal', params: { logId: logId ?? '', activeMeal: activeMeal ?? 'snack' } })}
                  style={{ flex: 1.4 }}
                />
                <VirraButton
                  label="Log manually"
                  variant="ghost"
                  onPress={() => setManual(true)}
                  style={{ flex: 1 }}
                />
              </View>

              {localResults.length > 0 && (
                <>
                  {query.trim().length > 0 && (
                    <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
                      COMMON FOODS
                    </VirraText>
                  )}
                  <VirraCard style={styles.resultsCard}>
                    {localResults.map((food, i) => (
                      <View key={food.id}>
                        {i > 0 && <View style={styles.divider} />}
                        <FoodRow food={food} onSelect={handleListSelect} />
                      </View>
                    ))}
                  </VirraCard>
                </>
              )}

              {(remoteResults.length > 0 || remoteSearching) && (
                <>
                  <View style={styles.sectionHeader}>
                    <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
                      OPEN FOOD FACTS
                    </VirraText>
                    {remoteSearching && <ActivityIndicator size="small" color={colors.muted} />}
                  </View>
                  {remoteResults.length > 0 && (
                    <VirraCard style={styles.resultsCard}>
                      {remoteResults.map((food, i) => (
                        <View key={food.id}>
                          {i > 0 && <View style={styles.divider} />}
                          <FoodRow food={food} onSelect={setSelected} showOffChip />
                        </View>
                      ))}
                    </VirraCard>
                  )}
                </>
              )}

              {localResults.length === 0 && remoteResults.length === 0 && !remoteSearching && query.trim().length > 0 && (
                <VirraCard style={styles.resultsCard}>
                  <VirraText variant="body" size={14} color={colors.muted} style={styles.empty}>
                    No results for "{query}"
                  </VirraText>
                </VirraCard>
              )}

              <VirraText variant="mono" size={10} color={colors.muted} style={styles.offAttribution}>
                FOOD DATA FROM OPEN FOOD FACTS · OPENFOODFACTS.ORG
              </VirraText>
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
  identifyingLabel:  { marginTop: spacing.md },
});

const qk = StyleSheet.create({
  pillRow:    { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs },
  pill:       { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', gap: 2, maxWidth: 160 },
  comboRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  comboRight: { alignItems: 'flex-end', gap: 1 },
});

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  header:      { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  closeBtn:    { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  mealTabs:    { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  mealTab:     { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  mealTabActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  inputWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.mist, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input:       { flex: 1, color: colors.breath, fontFamily: fonts.body, fontSize: 15, paddingVertical: 2 },
  scroll:      { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  resultsCard:   { gap: 0, paddingVertical: 0 },
  divider:       { height: 1, backgroundColor: colors.border },
  empty:         { textAlign: 'center', paddingVertical: spacing.md },
  actionRow:     { flexDirection: 'row', gap: spacing.sm },
  barcodeBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs, marginTop: spacing.xs },
  sectionLabel:  { letterSpacing: 1.5, paddingHorizontal: spacing.xs },
  offAttribution: {
    textAlign:     'center',
    letterSpacing: 1.5,
    marginTop:     spacing.lg,
    paddingTop:    spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
