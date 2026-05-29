# AI Commentary Shimmer Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static, near-invisible AI-commentary placeholders with an animated shimmer sweep on the Dashboard guidance cards and the Insights "THIS WEEK" narrative, and fix the timing so the shimmer paints on the very first frame of a cold launch.

**Architecture:** A new reusable `<Shimmer>` component built on React Native's built-in `Animated` API + `react-native-svg` (both already in the binary — no native rebuild). A soft `transparent → low-alpha cream → transparent` SVG gradient band translates across each skeleton bar on a loop. The two consuming screens drop their generic fallback copy (Dashboard `PHASE_META`) so AI text is the only source, initialise their loading flags to `true`, and render `<Shimmer>` while loading, real text when it arrives, and a graceful one-liner if the fetch resolves empty.

**Tech Stack:** React Native 0.81, Expo SDK 54, TypeScript, `react-native-svg` 15, `Animated`, jest-expo + @testing-library/react-native.

**Reference spec:** `docs/superpowers/specs/2026-05-28-ai-commentary-shimmer-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `mobile/src/components/ui/Shimmer.tsx` | Reusable animated skeleton primitive | **Create** |
| `mobile/__tests__/components/ui/Shimmer.test.tsx` | Unit tests for the primitive | **Create** |
| `mobile/app/(app)/(tabs)/index.tsx` | Dashboard — `GuidanceCard` shimmer + timing fix + drop `PHASE_META` fallback | **Modify** |
| `mobile/app/(app)/insights.tsx` | Insights — "THIS WEEK" + TRAINING/NUTRITION shimmer + timing fix | **Modify** |

All commands below assume the working directory is `mobile/`:

```bash
cd /Users/pauldickenson/Claude/virra/mobile
```

Note on paths: the `@/` alias maps to `mobile/src/` (see `tsconfig.json`). Expo-router screens live at `mobile/app/`. Screen filenames contain parentheses (`(app)`, `(tabs)`) — always quote them in shell commands.

---

## Task 1: Create the `<Shimmer>` component

**Files:**
- Create: `mobile/src/components/ui/Shimmer.tsx`
- Test: `mobile/__tests__/components/ui/Shimmer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/components/ui/Shimmer.test.tsx`:

```tsx
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { Shimmer } from '@/components/ui/Shimmer';

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
});

afterEach(() => jest.restoreAllMocks());

describe('Shimmer', () => {
  it('renders a single bar by default', () => {
    const { getAllByTestId } = render(<Shimmer height={20} width={200} />);
    expect(getAllByTestId('shimmer-bar')).toHaveLength(1);
  });

  it('renders one bar per line when lines is set', () => {
    const { getAllByTestId } = render(<Shimmer height={20} width={200} lines={3} />);
    expect(getAllByTestId('shimmer-bar')).toHaveLength(3);
  });

  it('renders the animated sweep when motion is allowed', async () => {
    const { findAllByTestId } = render(<Shimmer height={20} width={200} />);
    expect(await findAllByTestId('shimmer-sweep')).toHaveLength(1);
  });

  it('omits the sweep when reduce motion is enabled', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { queryAllByTestId } = render(<Shimmer height={20} width={200} />);
    await waitFor(() => expect(queryAllByTestId('shimmer-sweep')).toHaveLength(0));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/ui/Shimmer.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Shimmer'`.

- [ ] **Step 3: Write the component**

Create `mobile/src/components/ui/Shimmer.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Animated, Easing, StyleSheet, AccessibilityInfo,
  type LayoutChangeEvent, type ViewStyle, type StyleProp,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, radius as themeRadius, spacing } from '@/constants/theme';

interface ShimmerProps {
  /** Height of each bar, in px. Required. */
  height: number;
  /** Fixed width in px. Omit to fill the container (measured via onLayout). */
  width?: number;
  /** Corner radius of each bar. Defaults to radius.sm. */
  borderRadius?: number;
  /** Number of stacked bars. The last bar of a multi-line block is shortened. Defaults to 1. */
  lines?: number;
  /** Outer container style override. */
  style?: StyleProp<ViewStyle>;
}

const SWEEP_DURATION_MS = 1100;
// Base skeleton fill: colors.mist (#1C1C24) lifted slightly so the bar reads as a
// placeholder above the card surface even when the sweep is off (reduced motion).
const BASE_COLOR = '#26262F';

export function Shimmer({ height, width, borderRadius = themeRadius.sm, lines = 1, style }: ShimmerProps) {
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(width ?? null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  // Honour the OS "Reduce Motion" accessibility setting.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(v));
    return () => { mounted = false; sub.remove(); };
  }, []);

  // Drive the horizontal sweep once we know the width and motion is allowed.
  useEffect(() => {
    if (reduceMotion || measuredWidth == null) return;
    translateX.setValue(-measuredWidth);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: measuredWidth,
        duration: SWEEP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, measuredWidth, translateX]);

  function onLayout(e: LayoutChangeEvent) {
    if (width == null) setMeasuredWidth(e.nativeEvent.layout.width);
  }

  const count = Math.max(1, lines);
  const barWidths = Array.from({ length: count }, (_, i) =>
    count > 1 && i === count - 1 ? ('60%' as const) : ('100%' as const),
  );

  return (
    <View style={[s.container, style]} onLayout={onLayout} testID="shimmer">
      {barWidths.map((w, i) => (
        <View
          key={i}
          testID="shimmer-bar"
          style={{ width: w, height, borderRadius, backgroundColor: BASE_COLOR, overflow: 'hidden' }}
        >
          {!reduceMotion && measuredWidth != null && (
            <Animated.View
              testID="shimmer-sweep"
              style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
            >
              <Svg width={measuredWidth} height={height}>
                <Defs>
                  <LinearGradient id="shimmerGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={colors.breath} stopOpacity="0" />
                    <Stop offset="0.5" stopColor={colors.breath} stopOpacity="0.12" />
                    <Stop offset="1" stopColor={colors.breath} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width={measuredWidth} height={height} fill="url(#shimmerGrad)" />
              </Svg>
            </Animated.View>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: spacing.xs },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/ui/Shimmer.test.tsx`
Expected: PASS — 4 tests. (A `useNativeDriver` console warning from jest-expo is benign.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Shimmer.tsx "__tests__/components/ui/Shimmer.test.tsx"
git commit -m "feat: add reusable Shimmer loading component"
```

---

## Task 2: Wire Shimmer into Dashboard guidance cards + timing fix

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`

This task replaces the static guidance-card skeleton with `<Shimmer>`, removes the generic `PHASE_META` fallback copy (AI text is the only source), and initialises `insightLoading` to `true` so the shimmer paints on the first frame. `PHASE_META` stays imported — it still supplies `meta.color`, `meta.tagline`, and `meta.label` for the hero card.

- [ ] **Step 1: Add the Shimmer import**

Find (around line 18):

```tsx
import { SectionLabel } from '@/components/ui/SectionLabel';
import { PHASE_META } from '@/lib/phaseMeta';
```

Replace with:

```tsx
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Shimmer } from '@/components/ui/Shimmer';
import { PHASE_META } from '@/lib/phaseMeta';
```

- [ ] **Step 2: Rewrite `GuidanceCard` and its styles**

Find:

```tsx
function GuidanceCard({ title, body, accentColor, loading }: {
  title: string; body: string; accentColor: string; loading?: boolean;
}) {
  return (
    <VirraCard style={guide.card}>
      <SectionLabel color={accentColor} style={guide.label}>{title}</SectionLabel>
      {loading ? (
        <View style={guide.skeleton} />
      ) : (
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={guide.body}>{body}</VirraText>
      )}
    </VirraCard>
  );
}

const guide = StyleSheet.create({
  card:     { gap: spacing.xs },
  label:    { letterSpacing: 1.5 },
  body:     { lineHeight: 21, marginTop: spacing.xs },
  skeleton: { height: 42, borderRadius: 4, backgroundColor: colors.border },
});
```

Replace with:

```tsx
function GuidanceCard({ title, body, accentColor, loading }: {
  title: string; body: string | null; accentColor: string; loading: boolean;
}) {
  return (
    <VirraCard style={guide.card}>
      <SectionLabel color={accentColor} style={guide.label}>{title}</SectionLabel>
      {loading ? (
        <Shimmer height={18} lines={2} style={guide.shimmer} />
      ) : (
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={guide.body}>
          {body ?? 'Log a session to unlock your personalised guidance.'}
        </VirraText>
      )}
    </VirraCard>
  );
}

const guide = StyleSheet.create({
  card:    { gap: spacing.xs },
  label:   { letterSpacing: 1.5 },
  body:    { lineHeight: 21, marginTop: spacing.xs },
  shimmer: { marginTop: spacing.xs },
});
```

- [ ] **Step 3: Initialise the loading flag to `true`**

Find:

```tsx
  const [insightLoading, setInsightLoading] = useState(false);
```

Replace with:

```tsx
  const [insightLoading, setInsightLoading] = useState(true);
```

- [ ] **Step 4: Update the fallback comment in `loadInsight`**

Find:

```tsx
    } catch {
      // Silently fall back to PHASE_META
    } finally {
```

Replace with:

```tsx
    } catch {
      // Silently fall back to the graceful empty-state copy
    } finally {
```

- [ ] **Step 5: Drop the `PHASE_META` body fallback in the render**

Find:

```tsx
            <GuidanceCard
              title="Training"
              body={insightTexts?.training ?? meta.training}
              accentColor={meta.color}
              loading={insightLoading && !insightTexts}
            />
            <GuidanceCard
              title="Nutrition"
              body={insightTexts?.nutrition ?? meta.nutrition}
              accentColor={meta.color}
              loading={insightLoading && !insightTexts}
            />
```

Replace with:

```tsx
            <GuidanceCard
              title="Training"
              body={insightTexts?.training ?? null}
              accentColor={meta.color}
              loading={insightLoading && !insightTexts}
            />
            <GuidanceCard
              title="Nutrition"
              body={insightTexts?.nutrition ?? null}
              accentColor={meta.color}
              loading={insightLoading && !insightTexts}
            />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `colors` becomes unused after removing the skeleton style, the build still passes — it is used elsewhere in this file.)

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `npx jest`
Expected: PASS (same suites as before plus the new Shimmer suite; no new failures).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/(tabs)/index.tsx"
git commit -m "feat: shimmer dashboard guidance cards; drop generic phase fallback"
```

---

## Task 3: Wire Shimmer into the Insights screen + timing fix

**Files:**
- Modify: `mobile/app/(app)/insights.tsx`

This task replaces the static "THIS WEEK" skeleton with `<Shimmer>`, adds shimmer to the TRAINING and NUTRITION narrative blocks while they load (per spec), and fixes the timing so `loadingNarrative` is `true` from the first frame and through the metrics fetch — eliminating the brief "Log activities…" flash before the cache check resolves.

- [ ] **Step 1: Add the Shimmer import**

Find:

```tsx
import { AddEventModal } from '@/components/ui/AddEventModal';
import { SectionLabel } from '@/components/ui/SectionLabel';
```

Replace with:

```tsx
import { AddEventModal } from '@/components/ui/AddEventModal';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Shimmer } from '@/components/ui/Shimmer';
```

- [ ] **Step 2: Initialise `loadingNarrative` to `true`**

Find:

```tsx
  const [loadingNarrative, setLoadingNarrative] = useState(false);
```

Replace with:

```tsx
  const [loadingNarrative, setLoadingNarrative] = useState(true);
```

- [ ] **Step 3: Set the narrative loading flag at the top of `load()`**

Find:

```tsx
  const load = useCallback(async () => {
    if (!session) return;
    setLoadingMetrics(true);
```

Replace with:

```tsx
  const load = useCallback(async () => {
    if (!session) return;
    setLoadingMetrics(true);
    setLoadingNarrative(true);
```

- [ ] **Step 4: Clear the flag on a cache hit, and remove the now-redundant mid-function set**

Find:

```tsx
    const cached = cacheResult.data;
    if (cached && new Date(cached.expires_at) > new Date()) {
      setOverallText(cached.overall_text ?? null);
      setTrainingText(cached.training_text ?? null);
      setNutritionText(cached.nutrition_text ?? null);
      setGeneratedAt(cached.generated_at);
      return;
    }

    setLoadingNarrative(true);
    try {
```

Replace with:

```tsx
    const cached = cacheResult.data;
    if (cached && new Date(cached.expires_at) > new Date()) {
      setOverallText(cached.overall_text ?? null);
      setTrainingText(cached.training_text ?? null);
      setNutritionText(cached.nutrition_text ?? null);
      setGeneratedAt(cached.generated_at);
      setLoadingNarrative(false);
      return;
    }

    try {
```

(The `finally { setLoadingNarrative(false); }` block further down is unchanged — it clears the flag on the cache-miss path.)

- [ ] **Step 5: Replace the static "THIS WEEK" skeleton with `<Shimmer>`**

Find:

```tsx
          {loadingNarrative ? (
            <View style={styles.skeleton} />
          ) : overallText ? (
```

Replace with:

```tsx
          {loadingNarrative ? (
            <Shimmer height={20} lines={3} />
          ) : overallText ? (
```

- [ ] **Step 6: Add shimmer to the TRAINING block while loading**

Find:

```tsx
        {/* Training narrative */}
        {trainingText && (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>TRAINING</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {trainingText}
            </VirraText>
          </VirraCard>
        )}
```

Replace with:

```tsx
        {/* Training narrative */}
        {loadingNarrative ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>TRAINING</SectionLabel>
            <Shimmer height={18} lines={2} />
          </VirraCard>
        ) : trainingText ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>TRAINING</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {trainingText}
            </VirraText>
          </VirraCard>
        ) : null}
```

- [ ] **Step 7: Add shimmer to the NUTRITION block while loading**

Find:

```tsx
        {/* Nutrition narrative */}
        {nutritionText && (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>NUTRITION</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {nutritionText}
            </VirraText>
          </VirraCard>
        )}
```

Replace with:

```tsx
        {/* Nutrition narrative */}
        {loadingNarrative ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>NUTRITION</SectionLabel>
            <Shimmer height={18} lines={2} />
          </VirraCard>
        ) : nutritionText ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>NUTRITION</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {nutritionText}
            </VirraText>
          </VirraCard>
        ) : null}
```

- [ ] **Step 8: Remove the now-unused `skeleton` style**

Find:

```tsx
  narrativeBody:   { lineHeight: 26, fontStyle: 'italic' },
  skeleton:        { height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
  metricsCard:     { gap: spacing.md },
```

Replace with:

```tsx
  narrativeBody:   { lineHeight: 26, fontStyle: 'italic' },
  metricsCard:     { gap: spacing.md },
```

- [ ] **Step 9: Drop the now-unused `radius` import**

`radius.sm` was used only by the `skeleton` style just removed (verified: it is the sole `radius.` reference in this file). Remove it from the theme import.

Find:

```tsx
import { colors, spacing, radius } from '@/constants/theme';
```

Replace with:

```tsx
import { colors, spacing } from '@/constants/theme';
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Run the full test suite**

Run: `npx jest`
Expected: PASS, no new failures.

- [ ] **Step 12: Commit**

```bash
git add "app/(app)/insights.tsx"
git commit -m "feat: shimmer insights narrative blocks; fix first-frame timing"
```

---

## Task 4: End-to-end manual verification

**Files:** none (verification only)

These steps confirm the four behaviours from the spec's Verification section. They require running the app in the iOS simulator/device against a test account.

- [ ] **Step 1: Typecheck and unit tests are green**

Run: `npx tsc --noEmit && npx jest`
Expected: no type errors; all suites pass.

- [ ] **Step 2: Cold-launch path (the core fix)**

Clear the test user's cached insights so the Edge Function must regenerate. Use the Supabase MCP (`execute_sql`) or the SQL editor, substituting the test user's id:

```sql
delete from insights_cache where user_id = '<TEST_USER_ID>';
```

Start the app fresh (a new route file was added, so a cache clear is required — see the project's "Metro --clear on new routes" note):

Run: `npx expo start --clear`

Open the Dashboard. Expected: the Training and Nutrition guidance cards show the animated shimmer **from the first frame** (no faint empty box, no generic phase copy), then the AI text replaces the shimmer when Haiku returns. Open Insights. Expected: "THIS WEEK", TRAINING and NUTRITION show shimmer immediately, then settle to AI text (TRAINING/NUTRITION cards that have no text disappear).

- [ ] **Step 3: Warm path**

Background and re-foreground the app (or navigate away and back to Insights). Expected: cached text renders effectively instantly; shimmer is imperceptible or absent because the cache hit clears the flag immediately.

- [ ] **Step 4: Empty path**

With a brand-new test account that has no logged activities (or one whose Edge Function returns no text), confirm the surfaces settle to the graceful one-liner — Dashboard: "Log a session to unlock your personalised guidance."; Insights "THIS WEEK": "Log activities to unlock your personal insight." — and **not** an endless shimmer.

- [ ] **Step 5: Reduced motion**

Enable iOS Settings → Accessibility → Motion → Reduce Motion. Relaunch and re-trigger a cold load (repeat Step 2's delete). Expected: the skeleton bars render as static lifted blocks (no sweep), no crash, and still settle to text.

- [ ] **Step 6: Final commit (if any verification tweaks were needed)**

If Steps 2–5 surfaced a defect, fix it, re-run `npx tsc --noEmit && npx jest`, and commit. Otherwise this task is complete with no commit.

---

## Self-Review Notes

- **Spec coverage:** `<Shimmer>` component with `lines` + reduced-motion (Task 1); Dashboard wiring with `PHASE_META` removed (Task 2); Insights "THIS WEEK" + TRAINING/NUTRITION (Task 3); first-frame timing fix on both screens (Tasks 2 & 3); empty/error one-liners preserved (Tasks 2 & 3); verification incl. reduced-motion + cold/warm/empty paths (Task 4). All spec sections map to a task.
- **No new native dependency:** uses `react-native-svg` (already in `package.json` and the jest transform allowlist) and the built-in `Animated` API. No `expo-linear-gradient`, so no dev-client rebuild.
- **Type consistency:** `GuidanceCard.body` is `string | null` and `loading` is required `boolean` in both the definition and both call sites. `Shimmer` props (`height`, `width?`, `borderRadius?`, `lines?`, `style?`) are used consistently across the component, its tests, and both screens.
