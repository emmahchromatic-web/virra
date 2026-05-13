# Barcode Scanner — Open Food Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add barcode scanning to the food logging screen, looking up scanned EAN/UPC barcodes against the Open Food Facts API and returning a `VirraFood` result into the existing AddPanel flow.

**Architecture:** A new `src/lib/openFoodFacts.ts` module owns the OFF API call and response parsing. The parsing logic (`parseOFFProduct`) is exported separately from the network call (`lookupBarcode`) so it can be unit tested without mocking `fetch`. `food-search.tsx` re-adds the `CameraView` barcode scanner and a barcode button in the search row — when a scan resolves, it feeds the result into the existing `selected` state and `AddPanel` exactly as tapping a common-food row does.

**Tech Stack:** `expo-camera` (already installed, `CameraView` + `useCameraPermissions`), Open Food Facts REST API v2 (`world.openfoodfacts.org`), existing `VirraFood` type from `@/lib/commonFoods`, Jest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/openFoodFacts.ts` | OFF API call + response parser; exports `lookupBarcode` and `parseOFFProduct` |
| Create | `__tests__/lib/openFoodFacts.test.ts` | Unit tests for `parseOFFProduct` (no fetch mocking needed) |
| Modify | `app/(app)/food-search.tsx` | Re-add barcode scanner UI wired to `lookupBarcode` |

---

## Task 1: Create Open Food Facts library + tests

**Files:**
- Create: `src/lib/openFoodFacts.ts`
- Create: `__tests__/lib/openFoodFacts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/openFoodFacts.test.ts`:

```typescript
import { parseOFFProduct } from '@/lib/openFoodFacts';

const BARCODE = '5000112546415';

describe('parseOFFProduct', () => {
  it('returns null when status is not 1', () => {
    expect(parseOFFProduct({ status: 0 }, BARCODE)).toBeNull();
  });

  it('returns null when product has no name', () => {
    expect(parseOFFProduct({ status: 1, product: { nutriments: {} } }, BARCODE)).toBeNull();
  });

  it('returns null when product is missing entirely', () => {
    expect(parseOFFProduct({ status: 1 }, BARCODE)).toBeNull();
  });

  it('parses a well-formed UK product', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name_en: 'Whole Milk',
        brands: 'Arla, UK Dairy',
        nutriments: {
          'energy-kcal_100g': 67,
          'carbohydrates_100g': 4.7,
          'proteins_100g': 3.4,
          'fat_100g': 4.0,
          'fiber_100g': 0,
        },
      },
    }, BARCODE);

    expect(result).toEqual({
      id:        `off-${BARCODE}`,
      name:      'Whole Milk',
      detail:    'Arla',
      serving_g: 100,
      calories:  67,
      carbs_g:   4.7,
      protein_g: 3.4,
      fat_g:     4.0,
      fibre_g:   0,
    });
  });

  it('falls back to product_name when product_name_en is absent', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name: 'Pain complet',
        nutriments: { 'energy-kcal_100g': 240, 'carbohydrates_100g': 44, 'proteins_100g': 8, 'fat_100g': 2 },
      },
    }, BARCODE);
    expect(result?.name).toBe('Pain complet');
    expect(result?.detail).toBeUndefined();
  });

  it('handles missing nutriments gracefully with zeros', () => {
    const result = parseOFFProduct({
      status: 1,
      product: { product_name: 'Mystery Food', nutriments: {} },
    }, BARCODE);
    expect(result?.calories).toBe(0);
    expect(result?.carbs_g).toBe(0);
    expect(result?.fibre_g).toBe(0);
  });

  it('uses fibre_100g as fallback when fiber_100g is absent', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name: 'Bran Flakes',
        nutriments: { 'energy-kcal_100g': 357, 'carbohydrates_100g': 67, 'proteins_100g': 10, 'fat_100g': 2, 'fibre_100g': 13 },
      },
    }, BARCODE);
    expect(result?.fibre_g).toBe(13);
  });

  it('rounds macro values to 1 decimal place', () => {
    const result = parseOFFProduct({
      status: 1,
      product: {
        product_name: 'Test Food',
        nutriments: { 'energy-kcal_100g': 123.456, 'carbohydrates_100g': 10.123, 'proteins_100g': 5.678, 'fat_100g': 3.999 },
      },
    }, BARCODE);
    expect(result?.calories).toBe(123.5);
    expect(result?.carbs_g).toBe(10.1);
    expect(result?.protein_g).toBe(5.7);
    expect(result?.fat_g).toBe(4.0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/lib/openFoodFacts.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/lib/openFoodFacts'`

- [ ] **Step 3: Write `src/lib/openFoodFacts.ts`**

```typescript
import { type VirraFood } from './commonFoods';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_en,brands,nutriments';
const USER_AGENT = 'Virra-iOS/1.0 (food logger; hello@virra.app)';

export async function lookupBarcode(barcode: string): Promise<VirraFood | null> {
  try {
    const res = await fetch(`${OFF_BASE}/${barcode}.json?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    return parseOFFProduct(await res.json(), barcode);
  } catch {
    return null;
  }
}

export function parseOFFProduct(data: unknown, barcode: string): VirraFood | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.status !== 1) return null;

  const p = d.product as Record<string, unknown> | undefined;
  if (!p) return null;

  const name = ((p.product_name_en ?? p.product_name) as string | undefined)?.trim();
  if (!name) return null;

  const n = (p.nutriments ?? {}) as Record<string, unknown>;

  const toNum = (v: unknown): number => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isNaN(x) ? 0 : Math.round(x * 10) / 10;
  };

  const brand = typeof p.brands === 'string' && p.brands.trim()
    ? p.brands.split(',')[0].trim()
    : undefined;

  return {
    id:        `off-${barcode}`,
    name,
    detail:    brand,
    serving_g: 100,
    calories:  toNum(n['energy-kcal_100g']),
    carbs_g:   toNum(n['carbohydrates_100g']),
    protein_g: toNum(n['proteins_100g']),
    fat_g:     toNum(n['fat_100g']),
    fibre_g:   toNum(n['fiber_100g'] ?? n['fibre_100g']),
  };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/lib/openFoodFacts.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 8 passed, 8 total`

- [ ] **Step 5: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add src/lib/openFoodFacts.ts __tests__/lib/openFoodFacts.test.ts
git commit -m "feat: add Open Food Facts barcode lookup library"
```

---

## Task 2: Wire barcode scanner into food-search screen

**Files:**
- Modify: `app/(app)/food-search.tsx`

The current file (`app/(app)/food-search.tsx`) has no barcode scanner — it was removed when Nutritionix was cut. This task restores the scanner UI, wired to `lookupBarcode` from Task 1.

Key existing state/functions to preserve (do not remove):
- `query`, `selected`, `manual`, `adding` state
- `handleAdd`, `handleAddManual`, `results` derived from `searchCommonFoods`
- All three screen states: list / add panel / manual entry

**Changes needed:**

**1. Update imports** — add `useRef` to the React import, add camera and OFF imports:
```typescript
import React, { useState, useRef } from 'react';
// ... existing imports ...
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode } from '@/lib/openFoodFacts';
```

**2. Add scanner state** inside `FoodSearchScreen` (after existing state declarations):
```typescript
const [scanning,  setScanning]  = useState(false);
const scannedRef = useRef(false);
const [cameraPermission, requestCameraPermission] = useCameraPermissions();
```

**3. Add `handleBarcodeScanned`** (after existing `handleAddManual`):
```typescript
async function handleBarcodeScanned({ data }: { data: string }) {
  if (scannedRef.current) return;
  scannedRef.current = true;
  setScanning(false);
  const food = await lookupBarcode(data);
  if (food) {
    setSelected(food);
  } else {
    Alert.alert(
      'Not found',
      'This barcode wasn\'t recognised by Open Food Facts. Try searching by name or log manually.',
    );
    scannedRef.current = false;
  }
}
```

**4. Add `handleOpenScanner`** (after `handleBarcodeScanned`):
```typescript
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
```

**5. Add camera view** — insert before the `return (` of the main component (so scanning renders a full-screen camera instead of the normal UI):
```typescript
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
```

**6. Add barcode button to search row** — replace the existing `searchRow` View:
```typescript
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
```

**7. Add `scan` StyleSheet** (add after the existing `panel` StyleSheet, before the `styles` StyleSheet):
```typescript
const scan = StyleSheet.create({
  overlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  frame:    { width: 260, height: 160, borderWidth: 2, borderColor: 'rgba(212,255,38,0.8)', borderRadius: 12 },
  hint:     { marginTop: 20, letterSpacing: 1.5 },
});
```

**8. Add `barcodeBtn` to the `styles` StyleSheet**:
```typescript
barcodeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
```

- [ ] **Step 6: Apply all changes above to `app/(app)/food-search.tsx`**

Make all 8 changes listed. Read the file first to confirm current line numbers, then apply edits.

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "food-search" | head -20
```

Expected: no errors for `food-search.tsx`. Fix any that appear before committing.

- [ ] **Step 8: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (previous 58 + 8 new = 66 total).

- [ ] **Step 9: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/food-search.tsx"
git commit -m "feat: barcode scanner via Open Food Facts — replaces removed Nutritionix scanner"
```

---

## Self-Review

**Spec coverage:**
- ✅ Barcode scanner UI — Task 2 (CameraView + barcode button)
- ✅ OFF API lookup — Task 1 (`lookupBarcode`)
- ✅ Result fed into existing AddPanel — Task 2 (`setSelected(food)`)
- ✅ EAN-13/EAN-8/UPC-A/UPC-E support — Task 2 (`barcodeScannerSettings`)
- ✅ "Not found" error path — Task 2 (`handleBarcodeScanned` Alert)
- ✅ Camera permission fallback — Task 2 (`handleOpenScanner`)
- ✅ `fibre_g` included in parsed result — Task 1 (`parseOFFProduct`)
- ✅ Unit tests for parser — Task 1

**Placeholder scan:** None — all code blocks are complete.

**Type consistency:**
- `parseOFFProduct(data: unknown, barcode: string): VirraFood | null` — defined Task 1, used in tests Task 1 ✅
- `lookupBarcode(barcode: string): Promise<VirraFood | null>` — defined Task 1, called in `handleBarcodeScanned` Task 2 ✅
- `VirraFood` — imported from `@/lib/commonFoods` in both files ✅
- `setSelected(food)` — `selected` is `VirraFood | null`, `food` is `VirraFood` ✅
