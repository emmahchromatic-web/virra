import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { ActivityRow, type Activity } from '@/components/ui/ActivityRow';
import { getActiveBlocks, computeBlockLoad, endTrainingBlock, type TrainingBlock, type ComputedBlock } from '@/lib/trainingBlocks';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { SessionDetailModal } from '@/components/ui/SessionDetailModal';
import { TodaysSessionHero } from '@/components/ui/TodaysSessionHero';
import { enrichTodaysSessions, type TodaysSession } from '@/lib/todaysSession';
import { useTodaySessions } from '@/hooks/useTodaySessions';
import { SeasonTimeline, type SeasonChainSummary } from '@/components/ui/SeasonTimeline';

interface PlanTemplate {
  id:             string;
  name:           string;
  sport_type:     string;
  distance_goal:  string | null;
  duration_weeks: number;
  description:    string | null;
  tagline:        string | null;
}

interface UserPlan {
  id:          string;
  template_id: string;
  start_date:  string;
  goal_date:   string | null;
  template:    PlanTemplate;
}

const PHASE_WHY: Record<string, string> = {
  menstrual:  'Estrogen and progesterone are at their lowest. Your body is in repair mode — forcing intensity now delays recovery and increases injury risk.',
  follicular: 'Rising estrogen improves insulin sensitivity and muscle repair. This is your highest-adaptation window; hard work compounds here.',
  ovulatory:  'Estrogen peaks alongside a testosterone surge. Neuromuscular recruitment is at its highest — power and speed respond best in this short window.',
  luteal:     'Progesterone rises, core temperature is elevated, and perceived effort increases for the same output. Training smart here preserves the gains made earlier.',
};

const PHASE_LOAD: Record<string, { intensity: string; note: string }> = {
  menstrual:  { intensity: 'Easy',     note: 'Keep effort light — rest is training too.' },
  follicular: { intensity: 'Build',    note: 'Ramp up. Your body adapts faster now.' },
  ovulatory:  { intensity: 'Peak',     note: 'Hardest sessions belong here.' },
  luteal:     { intensity: 'Maintain', note: 'Hold the work, honour fatigue.' },
};

const MODALITY_ICON: Record<string, string> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.yoga',
  other:    'figure.walk',
};

const MODALITY_COLOR: Record<string, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

function WhyCard({ body }: { body: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={why.wrap} accessibilityRole="button">
      <View style={why.row}>
        <VirraText variant="mono" size={11} color="rgba(244,237,224,0.35)" style={why.label}>
          WHY?
        </VirraText>
        <SymbolView
          name={open ? 'chevron.up' : 'chevron.down'}
          size={10}
          tintColor="rgba(244,237,224,0.35)"
        />
      </View>
      {open && (
        <VirraText variant="body" size={13} color="rgba(244,237,224,0.55)" style={why.body}>
          {body}
        </VirraText>
      )}
    </Pressable>
  );
}

const why = StyleSheet.create({
  wrap:  { paddingTop: spacing.xs },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { letterSpacing: 1.5 },
  body:  { lineHeight: 20, marginTop: spacing.xs },
});

export default function TrainingScreen() {
  const { session }    = useAuthStore();
  const { cycleInfo, periodStart, cycleLength } = useCycleStore();

  const [activePlan,        setActivePlan]        = useState<UserPlan | null>(null);
  const [recentActivities,  setRecentActivities]   = useState<Activity[]>([]);
  const [, setLoading]                             = useState(true);
  const [activeBlocks,      setActiveBlocks]        = useState<TrainingBlock[]>([]);
  const [enrichedToday,     setEnrichedToday]       = useState<TodaysSession[]>([]);
  const [seasonSummary,     setSeasonSummary]       = useState<SeasonChainSummary | null>(null);

  // Today's planned sessions come from the shared session store (auto-updates on mutations);
  // we then run them through `enrichTodaysSessions` to hydrate activity metrics, cycle
  // modulation, and workout-structure summaries for the hero card.
  const todayPlanned = useTodaySessions();

  const now = new Date();
  const [calYear,        setCalYear]        = useState(now.getFullYear());
  const [calMonth,       setCalMonth]       = useState(now.getMonth() + 1);
  const [actionDate, setActionDate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (session) loadData();
    }, [session]),
  );

  // Re-enrich whenever the store's today-rows change (e.g. after a markComplete /
  // moveSession / dropSession). Keeps the hero in sync without a manual refetch.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    enrichTodaysSessions(session.user.id, todayPlanned as any).then((rows) => {
      if (!cancelled) setEnrichedToday(rows);
    }).catch(() => { /* fall through with whatever we have */ });
    return () => { cancelled = true; };
  }, [session, todayPlanned]);

  async function loadSeasonSummary(
    userId: string,
    cyclePhase: string | null,
  ): Promise<SeasonChainSummary | null> {
    const { data: season } = await supabase
      .from('seasons')
      .select('id, name, starts_on, ends_on')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!season) return null;

    const todayISO = new Date().toLocaleDateString('en-CA');

    const { data: events } = await supabase
      .from('user_events')
      .select('id, name, event_date')
      .eq('season_id', season.id)
      .gte('event_date', todayISO)
      .order('event_date');

    if (!events || events.length === 0) return null;

    // Bypass sessionStore on purpose: this read needs the `phase` column
    // (block_phase: base/build/peak/taper/race/recovery) which isn't part
    // of PlannedSessionRow. The season-summary card is the only consumer
    // of phase outside the SeasonEngine itself, so the column is omitted
    // from the cached row schema to keep AsyncStorage payload lean.
    const { data: currentSession } = await supabase
      .from('planned_sessions')
      .select('phase, block_id')
      .eq('user_id', userId)
      .eq('scheduled_date', todayISO)
      .neq('status', 'moved')
      .neq('status', 'dropped')
      .maybeSingle();

    const currentPhase = currentSession?.phase ?? 'rest';

    const totalWeeks = Math.max(
      1,
      Math.round(
        (new Date(`${season.ends_on}T00:00:00Z`).getTime() -
          new Date(`${season.starts_on}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24 * 7),
      ),
    );
    const currentWeek = Math.max(
      1,
      Math.min(
        totalWeeks,
        Math.ceil(
          (new Date(`${todayISO}T00:00:00Z`).getTime() -
            new Date(`${season.starts_on}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24 * 7),
        ),
      ),
    );

    const next = events[0];
    const nextInWeeks = Math.max(
      0,
      Math.round(
        (new Date(`${next.event_date}T00:00:00Z`).getTime() -
          new Date(`${todayISO}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24 * 7),
      ),
    );
    const laterEvents = events.slice(1).map((e, i) => {
      const priorDate = i === 0 ? next.event_date : events[i].event_date;
      const inWeeksAfterNext = Math.round(
        (new Date(`${e.event_date}T00:00:00Z`).getTime() -
          new Date(`${priorDate}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24 * 7),
      );
      return { name: e.name, in_weeks_after_next: inWeeksAfterNext, date: e.event_date };
    });

    return {
      season_name:         season.name,
      total_weeks:         totalWeeks,
      current_week:        currentWeek,
      current_phase:       currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1),
      current_cycle_phase: cyclePhase ? cyclePhase.charAt(0).toUpperCase() + cyclePhase.slice(1) : null,
      next_event_name:     next.name,
      next_event_in_weeks: nextInWeeks,
      next_event_date:     next.event_date,
      later_events:        laterEvents,
    };
  }

  async function loadData() {
    setLoading(true);
    const [blocks, planRes, activityRes, season] = await Promise.all([
      getActiveBlocks(session!.user.id),
      supabase
        .from('user_plans')
        .select('id, template_id, start_date, goal_date, template:plan_templates(id, name, sport_type, distance_goal, duration_weeks, description, tagline)')
        .eq('user_id', session!.user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('activities')
        .select('id, activity_type, sub_type, started_at, duration_seconds, distance_meters, phase_at_time, run_details(avg_pace_seconds_per_km)')
        .eq('user_id', session!.user.id)
        .order('started_at', { ascending: false })
        .limit(5),
      loadSeasonSummary(session!.user.id, cycleInfo?.phase ?? null),
    ]);
    setActiveBlocks(blocks);
    setActivePlan(planRes.data as UserPlan | null);
    setRecentActivities((activityRes.data ?? []) as Activity[]);
    setSeasonSummary(season);
    setLoading(false);
  }

  const phaseLoad = cycleInfo ? PHASE_LOAD[cycleInfo.phase] : null;

  const cycleStore = {
    periodStart: periodStart ?? null,
    cycleLength: cycleLength ?? 28,
    phase:       cycleInfo?.phase ?? null,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Training" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Phase banner */}
        {phaseLoad && cycleInfo && (
          <VirraCard style={styles.phaseBanner}>
            <View style={styles.phaseRow}>
              <VirraText variant="display" size={20} color={colors.breath}>
                {phaseLoad.intensity}
              </VirraText>
              <VirraText variant="mono" size={11} color={colors.pulse} style={styles.phaseLabel}>
                TODAY
              </VirraText>
            </View>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)" style={styles.phaseNote}>
              {phaseLoad.note}
            </VirraText>
            <WhyCard body={PHASE_WHY[cycleInfo.phase]} />
          </VirraCard>
        )}

        {/* Season chain overview */}
        <SeasonTimeline summary={seasonSummary} />

        {/* Today's planned session hero */}
        {(activeBlocks.length > 0 || activePlan) && (
          <TodaysSessionHero sessions={enrichedToday} />
        )}

        {/* Active plan / block stack */}
        {activeBlocks.length > 0 ? (
          <BlockStack
            blocks={activeBlocks}
            cyclePhase={cycleInfo?.phase ?? null}
            onAddBlock={() => router.push('/(app)/plans/browse' as any)}
            onDropped={loadData}
          />
        ) : activePlan ? (
          <ActivePlanCard plan={activePlan} onBrowse={() => router.push('/(app)/plans/browse' as any)} />
        ) : (
          <VirraCard style={styles.emptyCard}>
            <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
              You don't have an active plan yet.
            </VirraText>
            <VirraButton label="Browse plans" onPress={() => router.push('/(app)/plans/browse' as any)} style={{ marginTop: spacing.md }} />
          </VirraCard>
        )}

        {/* Monthly training calendar */}
        {activeBlocks.length > 0 && session && (
          <VirraCard style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>
                {new Date(calYear, calMonth - 1).toLocaleString('en-GB',
                  { month: 'long', year: 'numeric' }).toUpperCase()}
              </VirraText>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Pressable onPress={() => {
                  if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); }
                  else setCalMonth((m) => m - 1);
                }}>
                  <VirraText variant="mono" size={12} color={colors.muted}>{'<'}</VirraText>
                </Pressable>
                <Pressable onPress={() => {
                  if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); }
                  else setCalMonth((m) => m + 1);
                }}>
                  <VirraText variant="mono" size={12} color={colors.muted}>{'>'}</VirraText>
                </Pressable>
              </View>
            </View>
            <MonthCalendar
              userId={session.user.id}
              year={calYear}
              month={calMonth}
              onDayPress={(date) => {
                setActionDate(date);
              }}
            />
          </VirraCard>
        )}
        {actionDate && session && (
          <SessionDetailModal
            visible={!!actionDate}
            date={actionDate}
            userId={session.user.id}
            cycleStore={cycleStore}
            onClose={() => setActionDate(null)}
          />
        )}

        {/* Recent activity */}
        <View style={styles.activitySection}>
          <Pressable
            onPress={() => router.push('/(app)/timeline' as any)}
            style={styles.sectionHeader}
          >
            <VirraText variant="mono" size={11} color={colors.pulse} style={styles.sectionLabel}>
              RECENT ACTIVITY
            </VirraText>
            <VirraText variant="mono" size={11} color={colors.muted}>VIEW ALL →</VirraText>
          </Pressable>

          {recentActivities.length > 0 ? (
            <VirraCard style={styles.activityCard}>
              {recentActivities.map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <ActivityRow activity={a} />
                </View>
              ))}
            </VirraCard>
          ) : (
            <VirraText variant="body" size={13} color={colors.muted}>
              No activities yet — complete a run to see it here.
            </VirraText>
          )}
        </View>

        {/* Manual log fallback */}
        <Pressable
          onPress={() => router.push('/(app)/manual-activity' as any)}
          style={styles.manualLink}
          accessibilityRole="button"
        >
          <VirraText variant="mono" size={11} color="rgba(244,237,224,0.25)">
            Didn't have your watch? Log manually →
          </VirraText>
        </Pressable>

        {/* Browse plans footer link */}
        <Pressable
          onPress={() => router.push('/(app)/plans/browse' as any)}
          style={styles.browseLink}
          accessibilityRole="button"
        >
          <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>
            BROWSE ALL PLANS →
          </VirraText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Block stack ----

function BlockStack({ blocks, cyclePhase, onAddBlock, onDropped }: {
  blocks: TrainingBlock[]; cyclePhase: string | null; onAddBlock: () => void; onDropped: () => void;
}) {
  const computed = (cyclePhase
    ? computeBlockLoad(blocks, cyclePhase)
    : blocks.map((b) => ({ ...b, effective_load: b.load_modifier }))
  ) as ComputedBlock[];

  function confirmDrop(b: ComputedBlock) {
    const label = b.template?.name ?? b.modality;
    Alert.alert(
      `Drop ${label}?`,
      'Future sessions from this plan will stop. Past completed sessions stay in your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Drop',
          style:   'destructive',
          onPress: async () => {
            try {
              await endTrainingBlock(b.id);
              onDropped();
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              Alert.alert('Could not drop plan', msg);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={stack.container}>
      <VirraText variant="mono" size={11} color={colors.pulse} style={stack.title}>MY STACK</VirraText>
      {computed.map((b) => (
        <Pressable key={b.id} onPress={() => b.template_id && router.push(`/(app)/plan/${b.template_id}` as any)} accessibilityRole="button">
          <VirraCard style={stack.blockRow}>
            <View style={stack.iconWrap}>
              <SymbolView name={(MODALITY_ICON[b.modality] ?? 'figure.walk') as any} size={18} tintColor={MODALITY_COLOR[b.modality] ?? colors.muted} />
            </View>
            <View style={stack.blockBody}>
              <View style={stack.titleRow}>
                <VirraText variant="bodyMedium" size={14} color={colors.breath} style={{ flex: 1 }}>{b.template?.name ?? b.modality}</VirraText>
                {b.is_primary && (<VirraText variant="mono" size={10} color={colors.pulse} style={stack.primaryTag}>PRIMARY</VirraText>)}
              </View>
              <View style={stack.loadTrack}>
                <View style={[stack.loadFill, { width: `${Math.round(b.effective_load * 100)}%` as any, backgroundColor: MODALITY_COLOR[b.modality] ?? colors.pulse }]} />
              </View>
              <VirraText variant="mono" size={10} color={colors.muted}>
                {Math.round(b.effective_load * 100)}% load{b.effective_load < b.load_modifier ? ' · adjusted for stack' : ''}
              </VirraText>
            </View>
            <Pressable
              onPress={() => confirmDrop(b)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Drop ${b.template?.name ?? b.modality}`}
              style={stack.dropBtn}
            >
              <SymbolView name="trash" size={14} tintColor={colors.muted} />
            </Pressable>
          </VirraCard>
        </Pressable>
      ))}
      <Pressable onPress={onAddBlock} style={stack.addRow} accessibilityRole="button">
        <SymbolView name="plus" size={11} tintColor={colors.muted} />
        <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>ADD PLAN</VirraText>
      </Pressable>
    </View>
  );
}
const stack = StyleSheet.create({
  container:  { gap: spacing.sm },
  title:      { letterSpacing: 1.5 },
  blockRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  iconWrap:   { width: 28, alignItems: 'center', paddingTop: 2 },
  blockBody:  { flex: 1, gap: spacing.xs },
  titleRow:   { flexDirection: 'row', alignItems: 'center' },
  primaryTag: { letterSpacing: 1, marginLeft: spacing.sm },
  loadTrack:  { height: 3, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  loadFill:   { height: '100%', borderRadius: radius.full },
  addRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingLeft: spacing.xs },
  dropBtn:    { paddingHorizontal: spacing.sm, paddingTop: 2, alignSelf: 'flex-start' },
});

// ---- Active plan card ----

function ActivePlanCard({ plan, onBrowse }: { plan: UserPlan; onBrowse: () => void }) {
  const start      = new Date(plan.start_date);
  const today      = new Date();
  const weekNum    = Math.max(1, Math.floor((today.getTime() - start.getTime()) / (7 * 86400000)) + 1);
  const totalWeeks = plan.template.duration_weeks;
  const progress   = totalWeeks > 0 ? Math.min((weekNum - 1) / totalWeeks, 1) : 0;

  return (
    <Pressable onPress={() => router.push(`/(app)/plan/${plan.template_id}` as any)}>
      <VirraCard style={styles.activePlanCard}>
        <VirraText variant="mono" size={11} color={colors.pulse} style={styles.phaseLabel}>ACTIVE PLAN</VirraText>

        <VirraText variant="display" size={22} color={colors.breath} style={{ marginTop: spacing.xs }}>
          {plan.template.name}
        </VirraText>

        {plan.template.description && (
          <VirraText variant="body" size={13} color="rgba(244,237,224,0.55)" style={{ lineHeight: 20, marginTop: 2 }}>
            {plan.template.description}
          </VirraText>
        )}

        {/* Week progress bar */}
        {totalWeeks > 0 && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <VirraText variant="mono" size={11} color={colors.muted}>
              Week {weekNum} of {totalWeeks}
            </VirraText>
          </View>
        )}

        <View style={styles.planMeta}>
          {plan.template.sport_type && (
            <VirraText variant="mono" size={11} color={colors.muted}>
              {plan.template.sport_type.toUpperCase()}
              {plan.template.distance_goal ? ` · ${plan.template.distance_goal.replace(/_/g, ' ').toUpperCase()}` : ''}
            </VirraText>
          )}
          {plan.goal_date && (
            <VirraText variant="mono" size={11} color={colors.muted}>
              Goal: {new Date(plan.goal_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </VirraText>
          )}
        </View>

        <View style={styles.planFooter}>
          <VirraText variant="mono" size={11} color="rgba(244,237,224,0.35)">Tap to view full plan</VirraText>
          <SymbolView name="chevron.right" size={12} tintColor="rgba(244,237,224,0.35)" />
        </View>
      </VirraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  scroll:          { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  phaseBanner:     { gap: spacing.xs },
  phaseRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phaseLabel:      { letterSpacing: 1.5 },
  phaseNote:       { lineHeight: 20 },
  emptyCard:       { gap: spacing.sm },
  activePlanCard:  { gap: spacing.xs },
  progressWrap:    { gap: spacing.xs, marginTop: spacing.sm },
  progressTrack:   { height: 3, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: colors.pulse, borderRadius: radius.full },
  planMeta:        { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  planFooter:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  activitySection: { gap: spacing.sm },
  sectionHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel:    { letterSpacing: 1.5 },
  activityCard:    { paddingVertical: 0, gap: 0 },
  divider:         { height: 1, backgroundColor: colors.border },
  manualLink:      { alignItems: 'center', paddingVertical: spacing.sm },
  browseLink:      { alignItems: 'center', paddingVertical: spacing.md },
});
