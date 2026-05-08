import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { getActiveBlocks, addBlock, inferModality, type TrainingBlock } from '@/lib/trainingBlocks';

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

const PHASE_COLOR: Record<string, string> = {
  Base:        colors.muted,
  Steady:      colors.muted,
  Build:       colors.dawn,
  Peak:        colors.pulse,
  Recovery:    'rgba(244,237,224,0.35)',
  Taper:       `${colors.dawn}99`,
  'Race week': colors.heat,
};

const SESSION_LABEL: Record<string, string> = {
  easy:      'Easy',
  tempo:     'Tempo',
  threshold: 'Threshold',
  long:      'Long run',
  strength:  'Strength',
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
  const [raceOpen,      setRaceOpen]      = useState(false);
  const [raceName,      setRaceName]      = useState('');
  const [raceDate,      setRaceDate]      = useState('');

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

  const raceTarget  = parseDMY(raceDate);
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
    const today = new Date().toISOString().split('T')[0];
    let planStart = today;
    let goalDate: string | null = null;

    if (raceOpen && raceTarget && plan.duration_weeks > 0) {
      goalDate  = raceTarget.toISOString().split('T')[0];
      planStart = (startDate && !startInPast)
        ? startDate.toISOString().split('T')[0]
        : today;
    } else if (plan.duration_weeks > 0) {
      goalDate = new Date(Date.now() + plan.duration_weeks * 7 * 86400000).toISOString().split('T')[0];
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
    } else {
      const blockId = await addBlock(session!.user.id, {
        templateId:   plan.id,
        modality:     inferModality(plan.sport_type),
        startsOn:     planStart,
        endsOn:       goalDate,
        loadModifier: 1.0,
        isPrimary:    true,
      });
      if (!blockId) console.warn('training_block creation failed — plan started but stack not updated');
      router.replace('/(app)/(tabs)/training');
    }
  }

  async function handleAddSupplementary() {
    if (!session || !plan) return;
    setSaving(true);
    const today  = new Date().toISOString().split('T')[0];
    const endsOn = plan.duration_weeks > 0
      ? new Date(Date.now() + plan.duration_weeks * 7 * 86400000).toISOString().split('T')[0]
      : null;
    const id = await addBlock(session.user.id, {
      templateId:   plan.id,
      modality:     inferModality(plan.sport_type),
      startsOn:     today,
      endsOn,
      loadModifier: 0.5,
      isPrimary:    false,
    });
    setSaving(false);
    if (!id) {
      Alert.alert('Could not add block', 'Please try again.');
      return;
    }
    router.replace('/(app)/(tabs)/training');
  }

  const weeks         = (plan?.sessions_json ?? []) as WeekSession[];
  const peakKm        = weeks.length ? Math.max(...weeks.map((w) => w.km)) : 0;
  const sessionsPerWk = weeks[0]?.sessions.length ?? 0;
  const ctaLabel      = raceOpen && raceName.trim()
    ? `Start training for ${raceName.trim()}`
    : 'Start this plan';

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
            {plan.sport_type.toUpperCase()}
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
        {weeks.length > 0 && (
          <View style={styles.statsRow}>
            <StatPill label="DURATION"   value={plan.duration_weeks > 0 ? `${plan.duration_weeks}w` : '∞'} />
            <StatPill label="SESSIONS"   value={`${sessionsPerWk}/wk`} />
            <StatPill label="PEAK WEEK"  value={`${peakKm}km`} />
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
        {weeks.length > 0 && (
          <VirraCard style={styles.chartCard}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              WEEKLY VOLUME
            </VirraText>
            <VolumeChart weeks={weeks} />
            <View style={styles.legend}>
              {Object.entries(PHASE_COLOR).map(([label, color]) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <VirraText variant="mono" size={8} color={colors.muted}>{label.toUpperCase()}</VirraText>
                </View>
              ))}
            </View>
          </VirraCard>
        )}

        {/* Week-by-week breakdown */}
        {weeks.length > 0 && (
          <View style={styles.weekList}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              WEEK BY WEEK
            </VirraText>
            {weeks.map((w) => {
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
                  <View style={styles.kmBadge}>
                    <VirraText variant="display" size={22} color={colors.breath}>{w.km}</VirraText>
                    <VirraText variant="mono" size={9} color={colors.muted} style={{ alignSelf: 'flex-end', marginBottom: 2 }}>km</VirraText>
                  </View>
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
            {plan.duration_weeks > 0 && (
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
                    <TextInput
                      style={styles.input}
                      placeholder="Race date  DD.MM.YYYY"
                      placeholderTextColor={colors.muted}
                      value={raceDate}
                      onChangeText={setRaceDate}
                      keyboardType="numbers-and-punctuation"
                    />
                    {raceDate.length > 0 && !raceTarget && (
                      <VirraText variant="mono" size={9} color={colors.dawn}>Use format DD.MM.YYYY</VirraText>
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
            <VirraButton
              label={ctaLabel}
              onPress={handleStart}
              loading={saving}
              style={styles.cta}
            />
            {existingBlocks.length > 0 && (
              <VirraButton
                label="Add to stack as supplementary"
                variant="ghost"
                onPress={handleAddSupplementary}
                loading={saving}
                style={{ marginTop: spacing.xs }}
              />
            )}
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
  startHint:   { flexDirection: 'row', alignItems: 'center', gap: 6 },

  cta:         { marginTop: spacing.sm },
});
