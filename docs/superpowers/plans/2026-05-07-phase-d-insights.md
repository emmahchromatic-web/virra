# Phase D — Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Insights screen with on-device quantitative metrics and cycle-aware Haiku narrative summaries (weekly + monthly, cached via Supabase Edge Function).

**Architecture:** On-device metrics are computed directly from Supabase queries in `insightMetrics.ts` and passed as structured data to a `generate-insight` Edge Function, which checks a `insight_cache` table before calling Anthropic's Haiku API. The mobile screen fetches both in parallel and renders with graceful loading states. Dashboard gets a ghost-button entry point.

**Tech Stack:** React Native / Expo, Supabase (Postgres + Edge Functions + RLS), Anthropic Haiku API (`claude-haiku-4-5-20251001`), AsyncStorage (no new deps required)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/insightMetrics.ts` | Create | On-device metric computation from activities table |
| `supabase/functions/generate-insight/index.ts` | Create | Edge Function: cache check + Haiku call + store |
| `app/(app)/insights.tsx` | Create | Insights screen |
| `app/(app)/_layout.tsx` | Modify | Register `insights` route |
| `app/(app)/(tabs)/index.tsx` | Modify | Add Insights entry point on Dashboard |

---

### Task 1: `insight_cache` DB Migration

**Files:**
- Apply migration via Supabase MCP (`mcp__supabase__apply_migration`)

- [ ] **Step 1: Apply migration**

```sql
create table insight_cache (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  period_type    text not null check (period_type in ('weekly', 'monthly')),
  period_key     text not null,
  narrative      text not null,
  generated_at   timestamptz default now(),
  unique(user_id, period_type, period_key)
);

alter table insight_cache enable row level security;

create policy "users see own insights"
  on insight_cache for all using (auth.uid() = user_id);
```

Run via MCP: `mcp__supabase__apply_migration` with name `008_insight_cache`.

- [ ] **Step 2: Verify table exists**

Run: `mcp__supabase__execute_sql` with `select table_name from information_schema.tables where table_name = 'insight_cache'`

Expected: one row returned.

---

### Task 2: On-Device Insight Metrics (`src/lib/insightMetrics.ts`)

**Files:**
- Create: `src/lib/insightMetrics.ts`

- [ ] **Step 1: Create the file**

```typescript
import { supabase } from './supabase';

export interface PhasePace {
  phase:          string;
  avgPaceSecPerKm: number;
  activityCount:  number;
}

export interface InsightMetrics {
  streakDays:         number;
  weeklyKm:           number;
  monthlyKm:          number;
  totalKm:            number;
  consistencyPct:     number;   // % of last 28 days with ≥1 activity
  phasePaces:         PhasePace[];
  activitiesThisWeek: number;
}

function isoWeekKey(d = new Date()): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.ceil(((d.getTime() - startOfWeek1.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentPeriodKeys(): { weekKey: string; monthKey: string } {
  return { weekKey: isoWeekKey(), monthKey: monthKey() };
}

export async function computeInsightMetrics(userId: string): Promise<InsightMetrics> {
  const now       = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const window28   = new Date(now.getTime() - 28 * 86400000);

  const [weekRes, monthRes, totalRes, window28Res, paceRes] = await Promise.all([
    supabase
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId)
      .gte('started_at', weekStart.toISOString()),

    supabase
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId)
      .gte('started_at', monthStart.toISOString()),

    supabase
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId),

    supabase
      .from('activities')
      .select('started_at')
      .eq('user_id', userId)
      .gte('started_at', window28.toISOString()),

    supabase
      .from('activities')
      .select('phase_at_time, run_details(avg_pace_seconds_per_km)')
      .eq('user_id', userId)
      .eq('activity_type', 'run')
      .not('phase_at_time', 'is', null),
  ]);

  // km totals
  const sumKm = (rows: any[]) =>
    rows.reduce((acc, r) => acc + (r.distance_meters ?? 0), 0) / 1000;

  const weeklyKm   = sumKm(weekRes.data ?? []);
  const monthlyKm  = sumKm(monthRes.data ?? []);
  const totalKm    = sumKm(totalRes.data ?? []);

  // streak
  const weekActivities   = weekRes.data?.length ?? 0;
  const allDates = [...new Set(
    (window28Res.data ?? []).map((r: any) =>
      new Date(r.started_at).toISOString().split('T')[0]
    )
  )].sort((a, b) => (a > b ? -1 : 1));

  let streakDays = 0;
  const todayStr     = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

  if (allDates.length > 0 && (allDates[0] === todayStr || allDates[0] === yesterdayStr)) {
    let cursor = new Date(allDates[0]);
    for (const dateStr of allDates) {
      const d = new Date(dateStr);
      const diffDays = Math.round((cursor.getTime() - d.getTime()) / 86400000);
      if (diffDays <= 1) {
        streakDays++;
        cursor = d;
      } else {
        break;
      }
    }
  }

  // consistency
  const activeDays      = new Set(
    (window28Res.data ?? []).map((r: any) =>
      new Date(r.started_at).toISOString().split('T')[0]
    )
  ).size;
  const consistencyPct  = Math.round((activeDays / 28) * 100);

  // phase-pace averages
  const phaseMap = new Map<string, number[]>();
  for (const row of (paceRes.data ?? []) as any[]) {
    const phase = row.phase_at_time as string;
    const pace  = row.run_details?.[0]?.avg_pace_seconds_per_km ?? null;
    if (pace && pace > 0 && pace < 1800) {
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      phaseMap.get(phase)!.push(pace);
    }
  }
  const phasePaces: PhasePace[] = Array.from(phaseMap.entries()).map(([phase, paces]) => ({
    phase,
    avgPaceSecPerKm: Math.round(paces.reduce((a, b) => a + b, 0) / paces.length),
    activityCount: paces.length,
  }));

  return {
    streakDays,
    weeklyKm:           Math.round(weeklyKm * 10) / 10,
    monthlyKm:          Math.round(monthlyKm * 10) / 10,
    totalKm:            Math.round(totalKm * 10) / 10,
    consistencyPct,
    phasePaces,
    activitiesThisWeek: weekActivities,
  };
}

export function formatPaceMmSs(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: `generate-insight` Supabase Edge Function

**Files:**
- Create & deploy: `supabase/functions/generate-insight/index.ts` via `mcp__supabase__deploy_edge_function`

This function is called with the user's JWT (`verify_jwt: true`). It receives a pre-computed metrics payload, checks the cache, calls Haiku if stale, saves, and returns the narrative.

**Prerequisite:** Set the `ANTHROPIC_API_KEY` secret in Supabase Dashboard → Project Settings → Edge Functions before deploying (or via `supabase secrets set ANTHROPIC_API_KEY=...`). The mobile app does NOT hold the key.

- [ ] **Step 1: Deploy edge function via MCP**

Use `mcp__supabase__deploy_edge_function` with:
- `name`: `"generate-insight"`
- `verify_jwt`: `true`
- `entrypoint_path`: `"index.ts"`
- `files`: single file `index.ts` with content:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface RequestPayload {
  period_type:  "weekly" | "monthly";
  period_key:   string;
  metrics:      Record<string, unknown>;
  phase?:       string;
  day_of_cycle?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  const body: RequestPayload = await req.json();
  const { period_type, period_key, metrics, phase, day_of_cycle } = body;

  // Check cache
  const { data: cached } = await supabase
    .from("insight_cache")
    .select("narrative, generated_at")
    .eq("user_id", user.id)
    .eq("period_type", period_type)
    .eq("period_key", period_key)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime();
    if (age < CACHE_MAX_AGE_MS) {
      return new Response(JSON.stringify({ narrative: cached.narrative, cached: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Build prompt
  const m = metrics as any;
  const phaseLabel = phase ?? "unknown";
  const periodLabel = period_type === "weekly" ? "this week" : "this month";

  const phasePaceLines = Array.isArray(m.phasePaces)
    ? m.phasePaces.map((p: any) => `  - ${p.phase}: ${Math.floor(p.avgPaceSecPerKm / 60)}:${String(Math.floor(p.avgPaceSecPerKm % 60)).padStart(2, "0")}/km (${p.activityCount} runs)`).join("\n")
    : "  - No data yet";

  const prompt = `You are a supportive running coach for a women's fitness app called Virra. The user's current cycle phase is ${phaseLabel}${day_of_cycle ? ` (day ${day_of_cycle})` : ""}.

${period_type === "weekly" ? "Weekly" : "Monthly"} summary:
- Streak: ${m.streakDays ?? 0} consecutive active days
- Distance ${periodLabel}: ${period_type === "weekly" ? m.weeklyKm ?? 0 : m.monthlyKm ?? 0} km
- Total distance ever: ${m.totalKm ?? 0} km
- Consistency (last 28 days): ${m.consistencyPct ?? 0}%
- Activities this week: ${m.activitiesThisWeek ?? 0}
- Average pace by cycle phase:
${phasePaceLines}

Write a 2–3 sentence narrative insight that:
1. Celebrates one specific thing from the data
2. Gives one phase-aware recommendation for the coming ${period_type === "weekly" ? "week" : "month"}
3. Uses fuelling and performance language only — never calorie restriction, never diet culture
4. Speaks directly to the runner in second person ("you", not "she")
Tone: warm, direct, expert. Like a coach who knows her data.
Do not use emojis or bullet points. Plain prose only.`;

  // Call Haiku
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return new Response("API key not configured", { status: 500 });

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    return new Response(`Haiku error: ${err}`, { status: 502 });
  }

  const aiJson  = await aiRes.json();
  const narrative = aiJson.content?.[0]?.text?.trim() ?? "";

  // Upsert cache
  await supabase.from("insight_cache").upsert(
    { user_id: user.id, period_type, period_key, narrative, generated_at: new Date().toISOString() },
    { onConflict: "user_id,period_type,period_key" },
  );

  return new Response(JSON.stringify({ narrative, cached: false }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Confirm deploy succeeded**

Verify via `mcp__supabase__list_edge_functions` — `generate-insight` should appear.

---

### Task 4: Insights Screen (`app/(app)/insights.tsx`)

**Files:**
- Create: `app/(app)/insights.tsx`

The screen fetches metrics on mount, then fires two parallel calls to the edge function (weekly + monthly). Shows metric cards, phase-pace list, and both narratives.

- [ ] **Step 1: Create the screen**

```typescript
import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { computeInsightMetrics, currentPeriodKeys, formatPaceMmSs, type InsightMetrics } from '@/lib/insightMetrics';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

const PHASE_COLOR: Record<string, string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={tile.wrap}>
      <VirraText variant="display" size={28} color={colors.breath}>{value}</VirraText>
      <VirraText variant="mono" size={8} color={colors.muted} style={tile.label}>{label}</VirraText>
      {sub && <VirraText variant="mono" size={8} color={colors.pulse} style={tile.sub}>{sub}</VirraText>}
    </View>
  );
}

const tile = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.sm },
  label: { letterSpacing: 1.5, textAlign: 'center' },
  sub:   { letterSpacing: 1 },
});

function NarrativeCard({ title, narrative, loading }: { title: string; narrative: string | null; loading: boolean }) {
  return (
    <VirraCard style={narrative_s.card}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={narrative_s.label}>{title}</VirraText>
      {loading ? (
        <VirraText variant="mono" size={10} color={colors.muted}>GENERATING…</VirraText>
      ) : narrative ? (
        <VirraText variant="serif" size={16} color={colors.breath} style={narrative_s.body}>
          {narrative}
        </VirraText>
      ) : (
        <VirraText variant="body" size={13} color={colors.muted} style={{ lineHeight: 20 }}>
          Log a few more activities to unlock your narrative insight.
        </VirraText>
      )}
    </VirraCard>
  );
}

const narrative_s = StyleSheet.create({
  card:  { gap: spacing.sm },
  label: { letterSpacing: 1.5 },
  body:  { lineHeight: 26, fontStyle: 'italic' },
});

export default function InsightsScreen() {
  const { session }   = useAuthStore();
  const { cycleInfo } = useCycleStore();

  const [metrics,         setMetrics]         = useState<InsightMetrics | null>(null);
  const [weeklyNarrative, setWeeklyNarrative] = useState<string | null>(null);
  const [monthlyNarrative,setMonthlyNarrative]= useState<string | null>(null);
  const [loadingMetrics,  setLoadingMetrics]  = useState(true);
  const [loadingWeekly,   setLoadingWeekly]   = useState(false);
  const [loadingMonthly,  setLoadingMonthly]  = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const load = useCallback(async (force = false) => {
    if (!session) return;
    setLoadingMetrics(true);

    const m = await computeInsightMetrics(session.user.id);
    setMetrics(m);
    setLoadingMetrics(false);

    // Only fetch narrative if there's enough data
    if (m.totalKm < 1) return;

    const { weekKey, monthKey } = currentPeriodKeys();
    const metricsPayload = {
      streakDays:         m.streakDays,
      weeklyKm:           m.weeklyKm,
      monthlyKm:          m.monthlyKm,
      totalKm:            m.totalKm,
      consistencyPct:     m.consistencyPct,
      phasePaces:         m.phasePaces,
      activitiesThisWeek: m.activitiesThisWeek,
    };

    // If forcing refresh, delete cache entries first so edge function regenerates
    if (force) {
      await supabase.from('insight_cache')
        .delete()
        .eq('user_id', session.user.id)
        .in('period_key', [weekKey, monthKey]);
    }

    setLoadingWeekly(true);
    setLoadingMonthly(true);

    const callEdge = async (periodType: 'weekly' | 'monthly', periodKey: string) => {
      const { data, error } = await supabase.functions.invoke('generate-insight', {
        body: {
          period_type:   periodType,
          period_key:    periodKey,
          metrics:       metricsPayload,
          phase:         cycleInfo?.phase,
          day_of_cycle:  cycleInfo?.dayOfCycle,
        },
      });
      if (error) return null;
      return (data as any)?.narrative as string ?? null;
    };

    const [weekly, monthly] = await Promise.all([
      callEdge('weekly',  weekKey),
      callEdge('monthly', monthKey),
    ]);

    setWeeklyNarrative(weekly);
    setMonthlyNarrative(monthly);
    setLoadingWeekly(false);
    setLoadingMonthly(false);
  }, [session, cycleInfo]);

  useFocusEffect(useCallback(() => { load(); }, [session]));

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const streakStr = metrics ? `${metrics.streakDays}` : '—';
  const weekStr   = metrics ? `${metrics.weeklyKm}` : '—';
  const monthStr  = metrics ? `${metrics.monthlyKm}` : '—';
  const conStr    = metrics ? `${metrics.consistencyPct}%` : '—';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={10} color={colors.muted}>INSIGHTS</VirraText>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.pulse} />}
      >
        {/* Metric grid */}
        <VirraCard style={styles.metricsCard}>
          <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>YOUR NUMBERS</VirraText>
          <View style={styles.metricsGrid}>
            <MetricTile label="DAY STREAK"    value={streakStr} />
            <View style={styles.metricDivider} />
            <MetricTile label="THIS WEEK"     value={`${weekStr} km`} />
            <View style={styles.metricDivider} />
            <MetricTile label="THIS MONTH"    value={`${monthStr} km`} />
          </View>
          <View style={styles.metricDividerH} />
          <View style={styles.metricsGrid}>
            <MetricTile label="CONSISTENCY"   value={conStr} sub="LAST 28 DAYS" />
            {metrics && (
              <>
                <View style={styles.metricDivider} />
                <MetricTile label="ALL TIME"  value={`${metrics.totalKm} km`} />
                <View style={styles.metricDivider} />
                <MetricTile label="ACTIVITIES" value={`${metrics.activitiesThisWeek}`} sub="THIS WEEK" />
              </>
            )}
          </View>
        </VirraCard>

        {/* Phase-pace breakdown */}
        {metrics && metrics.phasePaces.length > 0 && (
          <VirraCard style={styles.paceCard}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              PACE BY PHASE
            </VirraText>
            {metrics.phasePaces
              .sort((a, b) => a.avgPaceSecPerKm - b.avgPaceSecPerKm)
              .map((pp) => (
              <View key={pp.phase} style={styles.paceRow}>
                <View style={[styles.phaseDot, { backgroundColor: PHASE_COLOR[pp.phase] ?? colors.muted }]} />
                <VirraText variant="body" size={13} color={colors.breath} style={{ flex: 1, textTransform: 'capitalize' }}>
                  {pp.phase}
                </VirraText>
                <VirraText variant="display" size={16} color={PHASE_COLOR[pp.phase] ?? colors.breath}>
                  {formatPaceMmSs(pp.avgPaceSecPerKm)}
                </VirraText>
                <VirraText variant="mono" size={8} color={colors.muted} style={{ width: 40, textAlign: 'right' }}>
                  {pp.activityCount} runs
                </VirraText>
              </View>
            ))}
          </VirraCard>
        )}

        {/* Narratives */}
        <NarrativeCard
          title="THIS WEEK"
          narrative={weeklyNarrative}
          loading={loadingWeekly}
        />
        <NarrativeCard
          title="THIS MONTH"
          narrative={monthlyNarrative}
          loading={loadingMonthly}
        />

        <VirraText variant="mono" size={8} color="rgba(244,237,224,0.2)" style={styles.pullHint}>
          PULL TO REFRESH INSIGHTS
        </VirraText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.mile },
  header:        { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  backBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:        { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  sectionLabel:  { letterSpacing: 1.5, marginBottom: spacing.xs },
  metricsCard:   { gap: spacing.md },
  metricsGrid:   { flexDirection: 'row', alignItems: 'center' },
  metricDivider: { width: 1, height: 44, backgroundColor: colors.border },
  metricDividerH:{ height: 1, backgroundColor: colors.border },
  paceCard:      { gap: spacing.sm },
  paceRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  phaseDot:      { width: 8, height: 8, borderRadius: 4 },
  pullHint:      { textAlign: 'center', letterSpacing: 2, marginTop: spacing.md },
});
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 5: Register Route + Dashboard Entry Point

**Files:**
- Modify: `app/(app)/_layout.tsx` — add `insights` route
- Modify: `app/(app)/(tabs)/index.tsx` — add Insights ghost button

- [ ] **Step 1: Register route in `_layout.tsx`**

Add to the `<Stack>` inside `AppLayout`:

```tsx
<Stack.Screen name="insights" options={{ presentation: 'card' }} />
```

Place it after the existing `<Stack.Screen name="timeline" .../>` line.

- [ ] **Step 2: Add Insights entry point to Dashboard**

In `app/(app)/(tabs)/index.tsx`, add an import for `VirraButton` (already imported) and after the two `<GuidanceCard>` lines but before the check-in `<VirraButton>`, insert:

```tsx
<Pressable
  onPress={() => router.push('/(app)/insights' as any)}
  style={insightLink}
  accessibilityRole="button"
>
  <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
    VIEW INSIGHTS →
  </VirraText>
</Pressable>
```

Add the style inside the existing `StyleSheet.create` call:
```ts
// add to existing styles object:
insightLink: { alignItems: 'center', paddingVertical: spacing.xs },
```

And add `Pressable` to the React Native import if not already present.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 6: Set Anthropic API Key Secret

**No code required — configuration step.**

- [ ] **Step 1: Set secret in Supabase**

In the Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:
```
ANTHROPIC_API_KEY = <your-key>
```

Or via Supabase CLI: `supabase secrets set ANTHROPIC_API_KEY=<your-key> --project-ref elebuieojodsjmghwjub`

Without this, the edge function returns 500 and narratives show "Log a few more activities to unlock your insight." — metrics still render fine.

---

## Self-Review

**Spec coverage:**
- ✅ On-device insight metrics (streak, distances, consistency, phase-pace averages)
- ✅ Haiku narrative insights weekly + monthly
- ✅ Cached (24h TTL, `insight_cache` table, `upsert` dedup)
- ✅ Force-refresh on pull-to-refresh
- ✅ Insights screen accessible from Dashboard
- ✅ API key server-side only (Edge Function)

**Gaps / deferred:**
- Adherence % (requires knowing which plan sessions were "completed" — no completed/skipped state on sessions yet; deferred to Phase E)
- App Store submission prep — separate pass after all screens are stable
