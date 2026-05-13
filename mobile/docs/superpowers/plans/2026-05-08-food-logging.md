# Food Logging Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead Nutritionix API dependency in `food-search.tsx` with a bundled common-foods list and a manual macro entry path, so users can actually log food today.

**Architecture:** A static TypeScript module (`src/lib/commonFoods.ts`) ships ~40 runner-relevant foods with per-100g macros and a `serving_g` default. The food search screen is rewritten to filter this list locally (no network), show an adjustable-grams panel on selection, and offer a "Log manually" fallback for anything not in the list. Barcode scanning is removed entirely (deferred to post-launch with Open Food Facts).

**Tech Stack:** React Native / Expo, Supabase JS client, `@/lib/notifications.cancelNutritionReminderForMeal`, expo-router, expo-symbols, existing VirraCard/VirraButton/VirraText design system.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/commonFoods.ts` | `VirraFood` type, 40-item food list, `searchCommonFoods()`, `scaleFood()` |
| Rewrite | `app/(app)/food-search.tsx` | Search UI wired to common foods + manual entry; barcode removed |
| Delete | `src/lib/nutritionix.ts` | Dead Nutritionix API wrapper — no longer referenced |

---

## Task 1: Create common foods library

**Files:**
- Create: `src/lib/commonFoods.ts`

- [ ] **Step 1: Write `src/lib/commonFoods.ts`**

```typescript
export interface VirraFood {
  id:        string;
  name:      string;
  detail?:   string;   // e.g. 'raw', 'cooked', 'canned in water'
  serving_g: number;   // suggested default serving in grams
  // all macros are per 100g
  calories:  number;
  carbs_g:   number;
  protein_g: number;
  fat_g:     number;
}

export const COMMON_FOODS: VirraFood[] = [
  // Carbs & grains
  { id: 'oats',           name: 'Oats',            detail: 'raw',            serving_g: 80,  calories: 389, carbs_g: 66,  protein_g: 17,  fat_g: 7   },
  { id: 'white-rice',     name: 'White rice',       detail: 'cooked',         serving_g: 200, calories: 130, carbs_g: 28,  protein_g: 2.7, fat_g: 0.3 },
  { id: 'brown-rice',     name: 'Brown rice',       detail: 'cooked',         serving_g: 200, calories: 112, carbs_g: 24,  protein_g: 2.6, fat_g: 0.9 },
  { id: 'pasta',          name: 'Pasta',            detail: 'cooked',         serving_g: 220, calories: 131, carbs_g: 25,  protein_g: 5,   fat_g: 1.1 },
  { id: 'wholegrain-bread', name: 'Wholegrain bread', detail: '1 slice ≈ 40g', serving_g: 40, calories: 247, carbs_g: 43,  protein_g: 9,   fat_g: 3.4 },
  { id: 'bagel',          name: 'Bagel',            detail: 'plain',          serving_g: 100, calories: 250, carbs_g: 50,  protein_g: 10,  fat_g: 1.6 },
  { id: 'sweet-potato',   name: 'Sweet potato',     detail: 'baked',          serving_g: 150, calories: 90,  carbs_g: 21,  protein_g: 2,   fat_g: 0.1 },
  { id: 'white-potato',   name: 'White potato',     detail: 'boiled',         serving_g: 180, calories: 87,  carbs_g: 20,  protein_g: 1.9, fat_g: 0.1 },
  { id: 'quinoa',         name: 'Quinoa',           detail: 'cooked',         serving_g: 185, calories: 120, carbs_g: 22,  protein_g: 4.4, fat_g: 1.9 },
  { id: 'granola',        name: 'Granola',                                     serving_g: 60,  calories: 450, carbs_g: 65,  protein_g: 10,  fat_g: 16  },
  // Fruit
  { id: 'banana',         name: 'Banana',                                      serving_g: 120, calories: 89,  carbs_g: 23,  protein_g: 1.1, fat_g: 0.3 },
  { id: 'blueberries',    name: 'Blueberries',                                 serving_g: 100, calories: 57,  carbs_g: 14,  protein_g: 0.7, fat_g: 0.3 },
  { id: 'apple',          name: 'Apple',                                       serving_g: 150, calories: 52,  carbs_g: 14,  protein_g: 0.3, fat_g: 0.2 },
  { id: 'medjool-dates',  name: 'Medjool dates',    detail: '1 date ≈ 25g',   serving_g: 25,  calories: 277, carbs_g: 75,  protein_g: 1.8, fat_g: 0.2 },
  { id: 'orange-juice',   name: 'Orange juice',                                serving_g: 250, calories: 45,  carbs_g: 10,  protein_g: 0.7, fat_g: 0.2 },
  // Protein
  { id: 'chicken-breast', name: 'Chicken breast',   detail: 'cooked',         serving_g: 150, calories: 165, carbs_g: 0,   protein_g: 31,  fat_g: 3.6 },
  { id: 'salmon',         name: 'Salmon',           detail: 'fillet',         serving_g: 140, calories: 208, carbs_g: 0,   protein_g: 20,  fat_g: 13  },
  { id: 'tuna',           name: 'Tuna',             detail: 'canned in water', serving_g: 120, calories: 116, carbs_g: 0,   protein_g: 26,  fat_g: 1   },
  { id: 'lean-beef-mince', name: 'Lean beef mince', detail: 'cooked',         serving_g: 150, calories: 215, carbs_g: 0,   protein_g: 26,  fat_g: 12  },
  { id: 'eggs-whole',     name: 'Eggs',             detail: '1 large ≈ 60g',  serving_g: 60,  calories: 155, carbs_g: 1.1, protein_g: 13,  fat_g: 11  },
  { id: 'egg-whites',     name: 'Egg whites',       detail: '1 white ≈ 35g',  serving_g: 35,  calories: 52,  carbs_g: 0.7, protein_g: 11,  fat_g: 0.2 },
  { id: 'greek-yogurt',   name: 'Greek yogurt',     detail: 'full fat',       serving_g: 200, calories: 97,  carbs_g: 6,   protein_g: 9,   fat_g: 5   },
  { id: 'cottage-cheese', name: 'Cottage cheese',                              serving_g: 150, calories: 98,  carbs_g: 3.4, protein_g: 11,  fat_g: 4.3 },
  { id: 'tofu',           name: 'Tofu',             detail: 'firm',           serving_g: 150, calories: 76,  carbs_g: 1.9, protein_g: 8,   fat_g: 4.8 },
  { id: 'lentils',        name: 'Lentils',          detail: 'cooked',         serving_g: 200, calories: 116, carbs_g: 20,  protein_g: 9,   fat_g: 0.4 },
  { id: 'chickpeas',      name: 'Chickpeas',        detail: 'cooked',         serving_g: 200, calories: 164, carbs_g: 27,  protein_g: 9,   fat_g: 2.6 },
  { id: 'edamame',        name: 'Edamame',          detail: 'shelled',        serving_g: 150, calories: 121, carbs_g: 9,   protein_g: 12,  fat_g: 5   },
  { id: 'whey-protein',   name: 'Protein powder',   detail: 'whey, 1 scoop ≈ 30g', serving_g: 30, calories: 375, carbs_g: 6, protein_g: 75, fat_g: 5 },
  // Dairy & fats
  { id: 'full-fat-milk',  name: 'Milk',             detail: 'full fat',       serving_g: 200, calories: 61,  carbs_g: 4.8, protein_g: 3.2, fat_g: 3.3 },
  { id: 'skimmed-milk',   name: 'Milk',             detail: 'skimmed',        serving_g: 200, calories: 34,  carbs_g: 5,   protein_g: 3.4, fat_g: 0.1 },
  { id: 'avocado',        name: 'Avocado',          detail: '½ ≈ 75g',        serving_g: 75,  calories: 160, carbs_g: 9,   protein_g: 2,   fat_g: 15  },
  { id: 'almonds',        name: 'Almonds',                                     serving_g: 30,  calories: 579, carbs_g: 22,  protein_g: 21,  fat_g: 50  },
  { id: 'peanut-butter',  name: 'Peanut butter',                               serving_g: 30,  calories: 588, carbs_g: 20,  protein_g: 25,  fat_g: 50  },
  { id: 'mixed-nuts',     name: 'Mixed nuts',                                  serving_g: 30,  calories: 607, carbs_g: 21,  protein_g: 20,  fat_g: 52  },
  { id: 'olive-oil',      name: 'Olive oil',                                   serving_g: 15,  calories: 884, carbs_g: 0,   protein_g: 0,   fat_g: 100 },
  // Fuel & extras
  { id: 'dark-chocolate', name: 'Dark chocolate',   detail: '70%+',           serving_g: 30,  calories: 600, carbs_g: 46,  protein_g: 7.8, fat_g: 43  },
  { id: 'honey',          name: 'Honey',                                       serving_g: 20,  calories: 304, carbs_g: 82,  protein_g: 0.3, fat_g: 0   },
  { id: 'coconut-water',  name: 'Coconut water',                               serving_g: 330, calories: 19,  carbs_g: 4.7, protein_g: 0.2, fat_g: 0.2 },
  { id: 'spinach',        name: 'Spinach',          detail: 'raw',            serving_g: 80,  calories: 23,  carbs_g: 3.6, protein_g: 2.9, fat_g: 0.4 },
  { id: 'energy-gel',     name: 'Energy gel',       detail: 'generic, 1 sachet ≈ 40g', serving_g: 40, calories: 100, carbs_g: 25, protein_g: 0, fat_g: 0 },
];

export function searchCommonFoods(query: string): VirraFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMON_FOODS;
  return COMMON_FOODS.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.detail?.toLowerCase().includes(q) ?? false),
  );
}

export function scaleFood(
  food: VirraFood,
  grams: number,
): { calories: number; carbs_g: number; protein_g: number; fat_g: number } {
  const f = grams / 100;
  return {
    calories:  Math.round(food.calories  * f * 10) / 10,
    carbs_g:   Math.round(food.carbs_g   * f * 10) / 10,
    protein_g: Math.round(food.protein_g * f * 10) / 10,
    fat_g:     Math.round(food.fat_g     * f * 10) / 10,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/commonFoods.ts
git commit -m "feat: add bundled common-foods library with 40 runner foods"
```

---

## Task 2: Rewrite food-search screen

**Files:**
- Rewrite: `app/(app)/food-search.tsx`

The new screen has three visual states:
1. **List** — filtered common-foods list (default: all foods, narrows as user types)
2. **Add panel** — shown when a food row is tapped; gram input + macro preview + Cancel/Add
3. **Manual entry** — shown when "Log manually" is tapped; name + cal/carbs/protein/fat fields + Cancel/Add

- [ ] **Step 3: Write `app/(app)/food-search.tsx`**

```typescript
import React, { useState } from 'react';
import {
  View, TextInput, ScrollView, Pressable, StyleSheet, SafeAreaView,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { COMMON_FOODS, searchCommonFoods, scaleFood, type VirraFood } from '@/lib/commonFoods';
import { cancelNutritionReminderForMeal } from '@/lib/notifications';
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
}

function ManualEntry({ onAdd, onCancel, adding }: {
  onAdd:    (macros: ManualMacros) => void;
  onCancel: () => void;
  adding:   boolean;
}) {
  const [v, setV] = useState<ManualMacros>({ food_name: '', calories: '', carbs_g: '', protein_g: '', fat_g: '' });
  const set = (key: keyof ManualMacros) => (val: string) => setV((prev) => ({ ...prev, [key]: val }));
  const canAdd = v.food_name.trim().length > 0 && parseFloat(v.calories) > 0;

  const fields: { key: keyof ManualMacros; label: string; placeholder: string }[] = [
    { key: 'food_name',  label: 'NAME',    placeholder: 'e.g. Post-run smoothie' },
    { key: 'calories',   label: 'KCAL',    placeholder: '0' },
    { key: 'carbs_g',    label: 'CARBS g', placeholder: '0' },
    { key: 'protein_g',  label: 'PROTEIN g', placeholder: '0' },
    { key: 'fat_g',      label: 'FAT g',   placeholder: '0' },
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
    });
    setAdding(false);
    if (error) { Alert.alert('Could not add food', error.message); return; }
    if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
      cancelNutritionReminderForMeal(mealType);
    }
    router.back();
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
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | head -40`

Expected: zero errors in `food-search.tsx` and `commonFoods.ts`.

If errors appear, fix them before committing.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/food-search.tsx
git commit -m "feat: replace Nutritionix with bundled common-foods list + manual entry"
```

---

## Task 3: Remove dead Nutritionix library

**Files:**
- Delete: `src/lib/nutritionix.ts`

- [ ] **Step 6: Confirm no remaining imports**

Run:
```bash
grep -r "nutritionix" /Users/pauldickenson/Claude/virra/mobile/src /Users/pauldickenson/Claude/virra/mobile/app --include="*.ts" --include="*.tsx" -l
```

Expected: no files listed. If any appear, update them to remove the import before deleting the file.

- [ ] **Step 7: Delete `src/lib/nutritionix.ts`**

```bash
rm /Users/pauldickenson/Claude/virra/mobile/src/lib/nutritionix.ts
```

- [ ] **Step 8: Final TypeScript check**

Run: `cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | head -40`

Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add -u src/lib/nutritionix.ts
git commit -m "chore: remove dead Nutritionix API library"
```

---

## Self-Review

**Spec coverage:**
- ✅ Remove Nutritionix dependency → Tasks 2 + 3
- ✅ Bundled ~40 runner foods with per-100g macros → Task 1
- ✅ Manual macro entry path → Task 2 (`ManualEntry` component)
- ✅ Barcode scanner removed → Task 2 (CameraView and all scanner state removed)
- ✅ `cancelNutritionReminderForMeal` preserved in both `handleAdd` and `handleAddManual` → Task 2
- ✅ Existing `food_entries` insert shape preserved → Task 2 (`handleAdd` / `handleAddManual`)
- ✅ Screen still accepts `logId` + `mealType` URL params → Task 2

**Placeholder scan:** None — all code blocks are complete.

**Type consistency:**
- `VirraFood` defined in Task 1, imported and used in Task 2 ✅
- `scaleFood` defined in Task 1, called in `AddPanel` and `handleAdd` in Task 2 ✅
- `ManualMacros` defined locally in Task 2 — used in `ManualEntry` and `handleAddManual` ✅
- `searchCommonFoods` defined in Task 1, called in Task 2 to derive `results` ✅
