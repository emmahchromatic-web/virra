# AI Commentary Shimmer Loading — Design

**Date:** 2026-05-28
**Status:** Approved (design)
**Surfaces:** Dashboard guidance cards, Insights "THIS WEEK" narrative

## Problem

On first (cold) launch, the AI commentary areas render as a faint, static, near-invisible
box for the 2–5s it takes the `generate-insights` Edge Function (Haiku) to return. It reads
as "blank/broken," not "loading." Two compounding causes:

1. **Presentation:** the existing placeholder is a static `View` at `colors.border`
   (`rgba(244, 237, 224, 0.08)`, 8% opacity, no animation) — it does not announce itself as
   a loading state.
2. **Timing:** the loading flag is only flipped to `true` *after* the local cache-miss check
   resolves, so the very first frame of a cold launch is a dead box before even the static
   placeholder logic engages.

## Goal

Polish the wait with an animated horizontal **shimmer sweep** on both surfaces, and fix the
timing so the shimmer paints on the first frame. (Pre-loading and typewriter reveal were
considered and explicitly deferred — the chosen priority is making the wait feel intentional.)

## Decisions (locked)

- **Shimmer everywhere.** Both Dashboard guidance cards and the Insights narrative show the
  shimmer while AI text loads.
- **AI text is the only source.** The generic `PHASE_META` fallback copy on the Dashboard
  guidance cards is **removed**. A brand-new user with no logged activity sees shimmer, then a
  graceful one-liner — never generic phase guidance.
- **No new native dependency.** Built with the React Native built-in `Animated` API plus
  `react-native-svg` (both already in the binary). Avoids a fresh `expo-dev-client` / EAS
  rebuild that `expo-linear-gradient` would force.

## Affected files (current state)

| File | Role |
|---|---|
| `mobile/app/(app)/(tabs)/index.tsx` | Dashboard. `GuidanceCard` (~L23–43) renders Training/Nutrition cards with `PHASE_META` fallback + static skeleton. `loadInsight()` (~L102–134), `insightLoading`/`insightTexts` state (~L82–83). |
| `mobile/app/(app)/insights.tsx` | Insights screen. "THIS WEEK" narrative (~L193–207), `loadingNarrative` state (~L67), static `styles.skeleton` (~L420), cache fetch + Edge Function call (~L85–141). |
| `mobile/components/Shimmer.tsx` | **New.** Shared shimmer primitive. |
| `mobile/supabase/functions/generate-insights/index.ts` | Edge Function — unchanged. |

(Line numbers are approximate snapshots; locate by symbol when implementing.)

## Component: `<Shimmer>` (`mobile/components/Shimmer.tsx`)

A reusable skeleton primitive.

**Structure**
- Base `View`: rounded, `backgroundColor` slightly raised above the host card (≈ `colors.mist`
  lifted, or a tuned skeleton token) so even the static (reduced-motion) state reads as a
  placeholder rather than a void.
- Overlay: an absolutely-positioned `react-native-svg` `<Svg>` containing a `<Rect>` filled
  with a `<LinearGradient>` highlight band — `transparent → low-alpha breath cream → transparent`
  — so the sweep is a soft light pass, not a hard bar.

**Animation**
- `Animated.loop` drives `translateX` on the overlay from `-width` to `+width`.
- Duration ≈ 1100ms, linear easing, `useNativeDriver: true`.
- Loop runs while mounted; component is only mounted during the loading phase.

**Props**
- `height: number` — required.
- `width?: number` — defaults to fill container (measured via `onLayout` if not provided).
- `borderRadius?: number` — defaults to `radius.sm`.
- `lines?: number` — render N stacked bars with consistent gaps; the **last** bar is rendered
  shorter (≈ 60% width) to mimic a ragged final line of text. Defaults to 1.
- `style?: ViewStyle` — outer container override.

**Reduced motion**
- On mount, read `AccessibilityInfo.isReduceMotionEnabled()`. If true, skip the translate loop
  and render only the static base block(s) — no animation, but still clearly a placeholder.
- Also subscribe to the `reduceMotionChanged` event so a mid-session toggle is honoured.

**Reuse rationale**
- Dashboard cards: `<Shimmer lines={2} />` (single-to-double text line).
- Insights narrative: `<Shimmer height={72} lines={3} />`.
- Same primitive serves any future loading state in the app.

## Wiring

### Dashboard `GuidanceCard` (`index.tsx`)
- **Remove** the `PHASE_META` generic `training`/`nutrition` fallback copy. AI text is the only
  source.
- While loading and `insightTexts` is absent → render `<Shimmer lines={2} />`.
- When `insightTexts` arrives → render the AI text.
- When the fetch resolves with no usable text (empty/error) → render a graceful one-liner (see
  Empty & error states). Never leave the shimmer mounted indefinitely.

### Insights "THIS WEEK" (`insights.tsx`)
- Replace the static `styles.skeleton` `View` with `<Shimmer height={72} lines={3} />`.
- Apply the same shimmer to the conditional TRAINING / NUTRITION text blocks while their text is
  loading.
- On resolve: AI text, or the existing one-liner fallback.

## Timing fix

The "blank first frame" is caused by the loading flag flipping `true` only after the cache-miss
check. Fix on both surfaces:

- **Initialize the loading state to `true`** (or derive `showShimmer = loading || (!text && !error)`)
  so the shimmer paints on the very first frame of a cold launch.
- Clear the shimmer only when text arrives **or** an error/empty state resolves.

## Empty & error states

Shimmer covers the *loading* phase only. On resolve:

- **Has text** → render it.
- **No data** (brand-new user, no activities) → existing one-liner
  ("Log activities to unlock your personal insight" on Insights; a Dashboard equivalent), not
  infinite shimmer.
- **Fetch error** → the same graceful one-liner fallback. Never spin forever.

## Out of scope (deferred)

- **Pre-loading** insights during boot/splash (eliminate the wait). Considered; not chosen.
- **Typewriter** reveal of arrived text. Considered; not chosen.
- Client-side persisted cache of insights (belongs to Phase J — local cache / offline).

## Verification

- **Component:** renders and sweeps in-app; multi-line variant lays out with a shorter final bar.
- **Cold launch:** clear `insights_cache` for the test user → shimmer shows from first frame →
  AI text replaces it on both surfaces.
- **Empty:** new user / no activities → graceful one-liner, not endless shimmer.
- **Reduced motion ON:** static placeholder block, no animation, no crash.
- **Error:** force the Edge Function to fail → graceful one-liner, shimmer cleared.
