import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Pressable, TextInput } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { getActiveBlocks, addBlock, inferModality, type TrainingBlock } from '@/lib/trainingBlocks';
import { computeDefaultDayAssignment, type SessionSlot } from '@/lib/scheduleGenerator';

interface WeekSession {
  week:     number;
  km:       number;
  label:    string;
  sessions: string[];
}

interface PlanTemplate {
  id:             string;
  name:           string;
  sport_type:     string;
  distance_goal:  string | null;
  duration_weeks: number;
  description:    string | null;
  sessions_json:  WeekSession[] | null;
}

const SPORT_LABEL: Record<string, string> = {
  run:      'Running',
  strength: 'Gym',
  swim:     'Swimming',
  yoga:     'Yoga',
  other:    'Training',
};

const PHASE_COLOR: Record<string, string> = {
  // Run phases
  Recovery:    '#9DB8AC',
  Base:        '#94B062',
  Steady:      '#C9B68F',
  Taper:       '#F5A077',
  Build:       '#D4521F',
  Peak:        '#D4FF26',
  'Race week': '#FF2E7E',
  // Gym phases
  Foundation:  '#9DB8AC',
  Strength:    '#FF6B3D',
};

const SESSION_LABEL: Record<string, string> = {
  easy:      'Easy',
  tempo:     'Tempo',
  threshold: 'Threshold',
  long:      'Long run',
  strength:  'Strength',
  lower:     'Lower body',
  upper:     'Upper body',
  rest:      'Rest',
  race:      'Race',
};

function parseDMY(str: string): Date | null {
  const m = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1]), mo = parseInt(m[2]) - 1, y = parseInt(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function SchedulePickerRow({
  label, selectedDay, takenDays, occupiedDays, onChange,
}: {
  label:        string;
  selectedDay:  number;
  takenDays:    number[];
  occupiedDays: number[];
  onChange:     (day: number) => void;
}) {
  const taken    = new Set(takenDays);
  const occupied = new Set(occupiedDays);
  return (
    <View style={picker.row}>
      <VirraText variant="mono" size={10} color={colors.breath} style={picker.label}>
        {label}
      </VirraText>
      <View style={picker.days}>
        {DAY_LETTERS.map((letter, i) => {
          const isSelected  = selectedDay === i;
          const isTaken     = taken.has(i);
          const isOccupied  = occupied.has(i) && !isSelected;
          return (
            <Pressable
              key={i}
              style={[picker.dayBtn, isSelected && picker.dayBtnActive, isTaken && !isSelected && picker.dayBtnTaken]}
              onPress={() => onChange(i)}
              accessibilityRole="button"
            >
              <VirraText
                variant="mono"
                size={9}
                color={isSelected ? colors.mile : isTaken ? 'rgba(244,237,224,0.25)' : colors.muted}
              >
                {letter}
              </VirraText>
              {isOccupied && <View style={picker.occupiedDot} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const picker = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label:       { width: 80, flexShrink: 0 },
  days:        { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  dayBtn:      {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  dayBtnActive:  { backgroundColor: colors.pulse, borderColor: colors.pulse },
  dayBtnTaken:   { borderColor: 'transparent' },
  occupiedDot:   { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.dawn },
});

function VolumeChart({ weeks }: { weeks: WeekSession[] }) {
  const maxKm = Math.max(...weeks.map((w) => w.km), 1);
  return (
    <View style={chart.container}>
      {weeks.map((w) => {
        const ratio    = w.km / maxKm;
        const barColor = PHASE_COLOR[w.label] ?? colors.pulse;
        return (
          <View key={w.week} style={chart.col}>
            <View style={chart.track}>
              <View style={[chart.fill, { height: `${ratio * 100}%` as any, backgroundColor: barColor }]} />
            </View>
            <VirraText variant="mono" size={8} color={colors.muted} style={chart.num}>
              {w.week}
            </VirraText>
          </View>
        );
      })}
    </View>
  );
}

interface UserPlan { start_date: string; goal_date: string | null }

export default function PlanDetailScreen() {
  const { id }        = useLocalSearchParams<{ id: string }>();
  const { session }   = useAuthStore();

  const [plan,          setPlan]          = useState<PlanTemplate | null>(null);
  const [userPlan,      setUserPlan]      = useState<UserPlan | null>(null);
  const [weekActualKm,  setWeekActualKm]  = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [existingBlocks, setExistingBlocks] = useState<TrainingBlock[]>([]);
  const [raceOpen,             setRaceOpen]             = useState(false);
  const [raceName,             setRaceName]             = useState('');
  const [raceDateObj,          setRaceDateObj]          = useState<Date | null>(null);
  const [showRacePicker,       setShowRacePicker]       = useState(false);
  const [dayAssignment,        setDayAssignment]        = useState<SessionSlot[]>([]);
  const [sessionCountOverride, setSessionCountOverride] = useState(0);
  const [durationOverride,     setDurationOverride]     = useState(0);
  const [occupiedDays,         setOccupiedDays]         = useState<number[]>([]);

  useEffect(() => {
    if (!id || !session) return;

    Promise.all([
      supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, sessions_json')
        .eq('id', id)
        .single(),
      supabase
        .from('user_plans')
        .select('start_date, goal_date')
        .eq('user_id', session.user.id)
        .eq('template_id', id)
        .eq('is_active', true)
        .maybeSingle(),
      getActiveBlocks(session.user.id),
    ]).then(async ([templateRes, planRes, blocks]) => {
      const t = templateRes.data as PlanTemplate;
      const p = planRes.data as UserPlan | null;
      setPlan(t);
      setUserPlan(p);
      if (t?.sessions_json?.length) {
        const defaultCount = (t.sessions_json as WeekSession[])[0]?.sessions?.length ?? 1;
        setSessionCountOverride(defaultCount);
        setDayAssignment(computeDefaultDayAssignment(t.sessions_json as any, defaultCount));
      }
      setDurationOverride(t?.duration_weeks > 0 ? t.duration_weeks : 8);
      setExistingBlocks(blocks);

      if (p) {
        const planStart  = new Date(p.start_date);
        const weekIdx    = Math.max(0, Math.floor((Date.now() - planStart.getTime()) / (7 * 86400000)));
        const weekStart  = new Date(planStart.getTime() + weekIdx * 7 * 86400000).toISOString();
        const weekEnd    = new Date(planStart.getTime() + (weekIdx + 1) * 7 * 86400000).toISOString();
        const { data: acts } = await supabase
          .from('activities')
          .select('distance_meters')
          .eq('user_id', session.user.id)
          .eq('activity_type', 'run')
          .gte('started_at', weekStart)
          .lt('started_at', weekEnd);
        const totalM = (acts ?? []).reduce((s: number, a: any) => s + (a.distance_meters ?? 0), 0);
        setWeekActualKm(Math.round(totalM / 100) / 10); // 1dp km
      }

      setLoading(false);
    });
  }, [id, session]);

  useEffect(() => {
    if (!session) return;
    const d   = new Date();
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    supabase
      .from('planned_sessions')
      .select('day_of_week')
      .eq('user_id', session.user.id)
      .gte('scheduled_date', fmt(monday))
      .lte('scheduled_date', fmt(sunday))
      .not('status', 'in', '("moved","dropped")')
      .then(({ data }) => {
        setOccupiedDays([...new Set((data ?? []).map((s: any) => s.day_of_week as number))]);
      });
  }, [session]);

  const raceTarget  = raceDateObj;
  const startDate   = raceTarget && plan?.duration_weeks
    ? new Date(raceTarget.getTime() - plan.duration_weeks * 7 * 86400000)
    : null;
  const weeksIn     = startDate
    ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / (7 * 86400000)))
    : 0;
  const startInPast = startDate ? startDate.getTime() < Date.now() : false;

  const startHint = raceOpen && raceTarget && plan?.duration_weeks
    ? startInPast
      ? `Starting now · you'll be on week ${weeksIn + 1} of ${plan.duration_weeks}`
      : `Plan starts ${startDate!.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
    : null;

  async function handleStart() {
    if (!session || !plan) return;
    setSaving(true);
    const today      = new Date().toISOString().split('T')[0];
    const effectiveDuration = durationOverride > 0 ? durationOverride : (plan.duration_weeks || 8);
    let planStart    = today;
    let goalDate: string | null = new Date(Date.now() + effectiveDuration * 7 * 86400000).toISOString().split('T')[0];

    if (raceOpen && raceTarget) {
      goalDate  = raceTarget.toISOString().split('T')[0];
      planStart = (startDate && !startInPast) ? startDate.toISOString().split('T')[0] : today;
    }

    await supabase.from('user_plans').update({ is_active: false }).eq('user_id', session.user.id);
    const { error } = await supabase.from('user_plans').insert({
      user_id:     session.user.id,
      template_id: plan.id,
      start_date:  planStart,
      goal_date:   goalDate,
      is_active:   true,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not start plan', error.message);
      return;
    }
    const blockId = await addBlock(session!.user.id, {
      templateId:     plan.id,
      modality:       inferModality(plan.sport_type),
      startsOn:       planStart,
      endsOn:         goalDate,
      loadModifier:   sameModalityPrimary ? 1.0 : 0.5,
      isPrimary:      !sameModalityPrimary,
      slotAssignments: dayAssignment.length > 0 ? dayAssignment : undefined,
      maxWeeks:        effectiveDuration,
    });
    if (!blockId) console.warn('training_block creation failed — plan started but stack not updated');
    router.replace('/(app)/(tabs)/training');
  }

  const weeks      = (plan?.sessions_json ?? []) as WeekSession[];
  const isStrength = plan?.sport_type === 'strength';

  // Gym plans: fixed session patterns per count — independent of template data
  const GYM_SESSIONS: Record<number, string[]> = {
    1: ['general'],
    2: ['lower', 'upper'],
    3: ['lower', 'upper', 'lower'],
    4: ['lower', 'upper', 'lower', 'upper'],
    5: ['lower', 'upper', 'lower', 'upper', 'general'],
  };

  // Gym phase progression based on position in plan
  function gymPhaseLabel(weekIndex: number, total: number): string {
    const pct = weekIndex / Math.max(total - 1, 1);
    if (pct < 0.2)  return 'Foundation';
    if (pct < 0.55) return 'Build';
    if (pct < 0.85) return 'Strength';
    return 'Peak';
  }

  const displayWeeks = userPlan || (!weeks.length && !isStrength)
    ? weeks
    : Array.from({ length: durationOverride }, (_, i) => {
        if (isStrength) {
          const sessions = GYM_SESSIONS[sessionCountOverride] ?? GYM_SESSIONS[2];
          return {
            week:     i + 1,
            km:       sessions.length,
            label:    gymPhaseLabel(i, durationOverride),
            sessions,
          };
        }
        const w = weeks[i % weeks.length];
        return { ...w, week: i + 1, sessions: w.sessions.slice(0, sessionCountOverride) };
      });

  const peakKm = displayWeeks.length ? Math.max(...displayWeeks.map((w) => w.km), 1) : 1;
  const sessionsPerWk   = weeks[0]?.sessions.length ?? 0;
  const MAX_SESSIONS    = 5;

  function adjustSessions(delta: number) {
    if (!plan?.sessions_json) return;
    const next = Math.max(1, Math.min(MAX_SESSIONS, sessionCountOverride + delta));
    setSessionCountOverride(next);
    setDayAssignment(computeDefaultDayAssignment(plan.sessions_json as any, next));
  }

  const hasExistingBlocks = existingBlocks.length > 0;
  const sameModalityPrimary = existingBlocks.some(
    (b) => b.modality === inferModality(plan?.sport_type ?? '') && b.is_primary,
  );
  const ctaLabel = raceOpen && raceName.trim()
    ? (hasExistingBlocks ? `Add training for ${raceName.trim()}` : `Start training for ${raceName.trim()}`)
    : hasExistingBlocks ? 'Add this plan' : 'Start this plan';

  // Active plan context
  const planStartDate  = userPlan ? new Date(userPlan.start_date) : null;
  const weekIndex      = planStartDate
    ? Math.max(0, Math.floor((Date.now() - planStartDate.getTime()) / (7 * 86400000)))
    : -1;
  const currentWeek    = weekIndex >= 0 && weekIndex < weeks.length ? weeks[weekIndex] : null;
  const planComplete   = weeks.length > 0 && weekIndex >= weeks.length;
  const weekStart      = planStartDate
    ? new Date(planStartDate.getTime() + weekIndex * 7 * 86400000)
    : null;
  const dayInWeek      = weekStart
    ? Math.min(6, Math.floor((Date.now() - weekStart.getTime()) / 86400000))
    : 0;
  const expectedByNow  = currentWeek ? currentWeek.km * (dayInWeek + 1) / 7 : 0;
  const onTrackStatus  = planComplete             ? 'PLAN COMPLETE'
    : !currentWeek                                ? null
    : isStrength                                  ? null
    : weekActualKm >= currentWeek.km              ? 'WEEK DONE'
    : weekActualKm >= expectedByNow * 0.8         ? 'ON TRACK'
    :                                               'BEHIND';
  const onTrackColor   = onTrackStatus === 'ON TRACK' || onTrackStatus === 'WEEK DONE' ? colors.pulse
    : onTrackStatus === 'BEHIND'                                                        ? colors.heat
    :                                                                                     colors.muted;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
          </Pressable>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.loadingWrap}>
          <VirraText variant="mono" size={10} color={colors.muted}>LOADING…</VirraText>
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.safe}>
        <VirraText variant="body" color={colors.muted} style={{ margin: spacing.lg }}>
          Plan not found.
        </VirraText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={10} color={colors.muted}>
          {userPlan ? 'MY PLAN' : 'PLAN DETAIL'}
        </VirraText>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <VirraText variant="mono" size={9} color={colors.dawn} style={styles.tag}>
            {(SPORT_LABEL[plan.sport_type] ?? plan.sport_type).toUpperCase()}
            {plan.distance_goal ? ` · ${plan.distance_goal.replace(/_/g, ' ').toUpperCase()}` : ''}
            {plan.duration_weeks > 0 ? `  ·  ${plan.duration_weeks} WEEKS` : '  ·  ONGOING'}
          </VirraText>
          <VirraText variant="display" size={30} color={colors.breath} style={styles.name}>
            {plan.name}
          </VirraText>
          {plan.description && (
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.65)" style={styles.desc}>
              {plan.description}
            </VirraText>
          )}
        </View>

        {/* Stats row */}
        {displayWeeks.length > 0 && (
          <View style={styles.statsRow}>
            {userPlan ? (
              <StatPill label="DURATION" value={`${plan.duration_weeks > 0 ? plan.duration_weeks : durationOverride}w`} />
            ) : (
              <View style={styles.statPill}>
                <VirraText variant="mono" size={9} color={colors.muted}>DURATION</VirraText>
                <View style={styles.adjRow}>
                  <Pressable style={styles.adjBtn} onPress={() => setDurationOverride((v) => Math.max(4, v - 1))}
                    disabled={durationOverride <= 4} accessibilityRole="button" accessibilityLabel="Shorter">
                    <SymbolView name="minus" size={11} tintColor={durationOverride <= 4 ? colors.border : colors.muted} />
                  </Pressable>
                  <VirraText variant="display" size={20} color={colors.breath}>{durationOverride}w</VirraText>
                  <Pressable style={styles.adjBtn} onPress={() => setDurationOverride((v) => Math.min(24, v + 1))}
                    disabled={durationOverride >= 24} accessibilityRole="button" accessibilityLabel="Longer">
                    <SymbolView name="plus" size={11} tintColor={durationOverride >= 24 ? colors.border : colors.muted} />
                  </Pressable>
                </View>
              </View>
            )}
            {userPlan ? (
              <StatPill label="SESSIONS" value={`${sessionsPerWk}/wk`} />
            ) : (
              <View style={styles.statPill}>
                <VirraText variant="mono" size={9} color={colors.muted}>SESSIONS</VirraText>
                <View style={styles.adjRow}>
                  <Pressable
                    style={styles.adjBtn}
                    onPress={() => adjustSessions(-1)}
                    disabled={sessionCountOverride <= 1}
                    accessibilityRole="button"
                    accessibilityLabel="Fewer sessions"
                  >
                    <SymbolView name="minus" size={11}
                      tintColor={sessionCountOverride <= 1 ? colors.border : colors.muted} />
                  </Pressable>
                  <VirraText variant="display" size={20} color={colors.breath}>
                    {sessionCountOverride}/wk
                  </VirraText>
                  <Pressable
                    style={styles.adjBtn}
                    onPress={() => adjustSessions(1)}
                    disabled={sessionCountOverride >= MAX_SESSIONS}
                    accessibilityRole="button"
                    accessibilityLabel="More sessions"
                  >
                    <SymbolView name="plus" size={11}
                      tintColor={sessionCountOverride >= MAX_SESSIONS ? colors.border : colors.muted} />
                  </Pressable>
                </View>
              </View>
            )}
            {!isStrength && (
              <StatPill label="PEAK WEEK" value={`${peakKm}km`} />
            )}
          </View>
        )}

        {/* Current week card — active plans only */}
        {userPlan && currentWeek && (
          <VirraCard style={styles.currentWeekCard} accent>
            <View style={styles.currentWeekHeader}>
              <View style={styles.currentWeekLeft}>
                <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
                  CURRENT WEEK · WEEK {weekIndex + 1} OF {weeks.length}
                </VirraText>
                <VirraText variant="bodyMedium" size={18} color={PHASE_COLOR[currentWeek.label] ?? colors.breath}>
                  {currentWeek.label}
                </VirraText>
              </View>
              {onTrackStatus && (
                <View style={[styles.statusPill, { borderColor: onTrackColor }]}>
                  <VirraText variant="mono" size={8} color={onTrackColor}>{onTrackStatus}</VirraText>
                </View>
              )}
            </View>

            {!isStrength && (
              <>
                {/* km progress */}
                <View style={styles.kmProgress}>
                  <View style={styles.kmProgressTrack}>
                    <View style={[styles.kmProgressFill, {
                      width: `${Math.min(weekActualKm / currentWeek.km, 1) * 100}%` as any,
                      backgroundColor: onTrackColor,
                    }]} />
                  </View>
                  <View style={styles.kmProgressLabels}>
                    <VirraText variant="mono" size={9} color={colors.breath}>
                      {weekActualKm.toFixed(1)} km done
                    </VirraText>
                    <VirraText variant="mono" size={9} color={colors.muted}>
                      {currentWeek.km} km planned
                    </VirraText>
                  </View>
                </View>

                {/* Day hint */}
                <VirraText variant="mono" size={9} color={colors.muted}>
                  Day {dayInWeek + 1} of 7
                  {expectedByNow > 0 && weekActualKm < currentWeek.km
                    ? `  ·  ${expectedByNow.toFixed(1)} km expected by now`
                    : ''}
                </VirraText>
              </>
            )}

            {/* Session chips */}
            <View style={styles.chips}>
              {currentWeek.sessions.map((s, i) => (
                <View key={i} style={styles.chip}>
                  <VirraText variant="mono" size={9} color={colors.breath}>
                    {SESSION_LABEL[s] ?? s}
                  </VirraText>
                </View>
              ))}
            </View>
          </VirraCard>
        )}

        {userPlan && planComplete && (
          <VirraCard style={styles.currentWeekCard} accent>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>PLAN COMPLETE</VirraText>
            <VirraText variant="serif" size={16} color={colors.breath} style={{ lineHeight: 24 }}>
              You've finished all {weeks.length} weeks. Time to pick your next challenge.
            </VirraText>
          </VirraCard>
        )}

        {/* Volume chart */}
        {displayWeeks.length > 0 && (
          <VirraCard style={styles.chartCard}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              {isStrength ? 'WEEKLY LOAD' : 'WEEKLY VOLUME'}
            </VirraText>
            <VolumeChart weeks={displayWeeks} />
            <View style={styles.legend}>
              {Object.entries(PHASE_COLOR).filter(([label]) => displayWeeks.some((w) => w.label === label)).map(([label, color]) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <VirraText variant="mono" size={8} color={colors.muted}>{label.toUpperCase()}</VirraText>
                </View>
              ))}
            </View>
          </VirraCard>
        )}

        {/* Week-by-week breakdown */}
        {displayWeeks.length > 0 && (
          <View style={styles.weekList}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              WEEK BY WEEK
            </VirraText>
            {displayWeeks.map((w) => {
              const isCurrent = userPlan && w.week === weekIndex + 1;
              return (
              <VirraCard key={w.week} style={[styles.weekCard, isCurrent && styles.weekCardCurrent]}>
                <View style={styles.weekHeader}>
                  <View>
                    <VirraText variant="mono" size={9} color={isCurrent ? colors.pulse : colors.muted}>
                      WEEK {w.week}{isCurrent ? ' · NOW' : ''}</VirraText>
                    <VirraText variant="bodyMedium" size={15} color={PHASE_COLOR[w.label] ?? colors.breath} style={{ marginTop: 2 }}>
                      {w.label}
                    </VirraText>
                  </View>
                  {!isStrength && (
                    <View style={styles.kmBadge}>
                      <VirraText variant="display" size={22} color={colors.breath}>{w.km}</VirraText>
                      <VirraText variant="mono" size={9} color={colors.muted} style={{ alignSelf: 'flex-end', marginBottom: 2 }}>km</VirraText>
                    </View>
                  )}
                </View>
                <View style={styles.chips}>
                  {w.sessions.map((s, i) => (
                    <View key={i} style={styles.chip}>
                      <VirraText variant="mono" size={9} color={colors.breath}>
                        {SESSION_LABEL[s] ?? s}
                      </VirraText>
                    </View>
                  ))}
                </View>
              </VirraCard>
              );
            })}
          </View>
        )}

        {userPlan ? (
          <VirraButton
            label="Switch plan"
            variant="ghost"
            onPress={() => router.back()}
            style={styles.cta}
          />
        ) : (
          <>
            {plan.duration_weeks > 0 && !isStrength && (
              <VirraCard style={styles.raceCard} accent={raceOpen}>
                <Pressable style={styles.raceToggle} onPress={() => setRaceOpen((v) => !v)}>
                  <View style={{ flex: 1 }}>
                    <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
                      RACE GOAL
                    </VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>
                      {raceOpen ? 'Training for a specific race' : 'Add a race to reverse-engineer this plan'}
                    </VirraText>
                  </View>
                  <SymbolView name={raceOpen ? 'chevron.up' : 'chevron.down'} size={15} tintColor={colors.muted} />
                </Pressable>
                {raceOpen && (
                  <View style={styles.raceInputs}>
                    <TextInput
                      style={styles.input}
                      placeholder="Race name (e.g. Yorkshire Marathon)"
                      placeholderTextColor={colors.muted}
                      value={raceName}
                      onChangeText={setRaceName}
                    />
                    <Pressable
                      style={styles.datePicker}
                      onPress={() => setShowRacePicker(true)}
                      accessibilityRole="button"
                    >
                      <VirraText variant="mono" size={13} color={raceDateObj ? colors.breath : colors.muted}>
                        {raceDateObj
                          ? raceDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Select race date'}
                      </VirraText>
                      <SymbolView name="calendar" size={14} tintColor={colors.muted} />
                    </Pressable>
                    {showRacePicker && (
                      <DateTimePicker
                        value={raceDateObj ?? new Date()}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={(_: DateTimePickerEvent, selected?: Date) => {
                          setShowRacePicker(false);
                          if (selected) setRaceDateObj(selected);
                        }}
                      />
                    )}
                    {startHint && (
                      <View style={styles.startHint}>
                        <SymbolView name="calendar" size={12} tintColor={colors.pulse} />
                        <VirraText variant="mono" size={10} color={colors.pulse}>{startHint}</VirraText>
                      </View>
                    )}
                  </View>
                )}
              </VirraCard>
            )}
            {dayAssignment.length > 0 && (
              <VirraCard style={{ gap: spacing.sm }}>
                <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
                  SCHEDULE YOUR WEEK
                </VirraText>
                <VirraText variant="mono" size={8} color={colors.muted} style={{ marginTop: -spacing.xs }}>
                  ORANGE DOTS = DAYS WITH OTHER PLAN SESSIONS
                </VirraText>
                {dayAssignment.map((slot) => (
                  <SchedulePickerRow
                    key={slot.key}
                    label={SESSION_LABEL[slot.label] ?? slot.label.charAt(0).toUpperCase() + slot.label.slice(1)}
                    selectedDay={slot.day}
                    takenDays={dayAssignment.filter((s) => s.key !== slot.key).map((s) => s.day)}
                    occupiedDays={occupiedDays}
                    onChange={(d) => setDayAssignment((prev) =>
                      prev.map((s) => s.key === slot.key ? { ...s, day: d } : s)
                    )}
                  />
                ))}
              </VirraCard>
            )}
            <VirraButton
              label={ctaLabel}
              onPress={handleStart}
              loading={saving}
              style={styles.cta}
            />
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
      <VirraText variant="display" size={20} color={colors.breath}>{value}</VirraText>
    </View>
  );
}

const chart = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 3, marginTop: spacing.md, marginBottom: spacing.xs },
  col:       { flex: 1, alignItems: 'center', gap: 4 },
  track:     { flex: 1, width: '100%', justifyContent: 'flex-end' },
  fill:      { width: '100%', borderRadius: 2, minHeight: 3 },
  num:       { letterSpacing: 0 },
});

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  header:      { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  backBtn:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  titleBlock:  { gap: spacing.xs },
  tag:         { letterSpacing: 1.5 },
  name:        { lineHeight: 36 },
  desc:        { lineHeight: 22, marginTop: spacing.xs },

  statsRow:    { flexDirection: 'row', gap: spacing.sm },
  statPill:    { flex: 1, backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, gap: 2, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  adjRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adjBtn:      { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 5 },

  sectionLabel:{ letterSpacing: 1.5, marginBottom: spacing.xs },
  chartCard:   { gap: 0 },
  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 6, height: 6, borderRadius: 3 },

  currentWeekCard:    { gap: spacing.md },
  currentWeekHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  currentWeekLeft:    { gap: 2, flex: 1 },
  statusPill:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  kmProgress:         { gap: spacing.xs },
  kmProgressTrack:    { height: 4, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  kmProgressFill:     { height: '100%', borderRadius: radius.full },
  kmProgressLabels:   { flexDirection: 'row', justifyContent: 'space-between' },

  weekList:    { gap: spacing.sm },
  weekCard:    { gap: spacing.sm },
  weekCardCurrent: { borderColor: colors.pulse },
  weekHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kmBadge:     { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip:        { paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: `${colors.mist}cc`, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },

  raceCard:    { gap: 0 },
  raceToggle:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  raceInputs:  { gap: spacing.sm, marginTop: spacing.md },
  input:       {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.breath,
  },
  datePicker:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md,
  },
  startHint:   { flexDirection: 'row', alignItems: 'center', gap: 6 },

  cta:         { marginTop: spacing.sm },
});
