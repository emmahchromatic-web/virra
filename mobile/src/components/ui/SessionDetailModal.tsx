import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraCard } from './VirraCard';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { VirraButton } from './VirraButton';
import { dropSession, moveSession } from '@/lib/scheduleGenerator';
import { getDaySessionDetail, formatPace } from '@/lib/volumePlan';
import { supabase } from '@/lib/supabase';
import type { CyclePhase } from '@/lib/cycleEngine';
import type { DayDetail, SessionDetail, RunSessionDetail, StrengthSessionDetail, UserEvent } from '@/lib/volumePlan';
import { useCycleStore } from '@/store/cycle';

interface Props {
  visible:    boolean;
  date:       string;
  userId:     string;
  cycleStore: { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null };
  onClose:    () => void;
  onMutate:   () => void;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function mondayOfISO(iso: string): string {
  const d   = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

const PHASE_COLOR: Record<string, string> = {
  follicular: colors.pulse,
  ovulatory:  colors.pulse,
  luteal:     colors.dawn,
  menstrual:  colors.muted,
};

function renderRunStep(
  step: { id: string; kind: string; label?: string; target: any; repeat_count?: number; sub_steps?: any[] },
  depth: number = 0,
): React.ReactNode {
  if (step.kind === 'repeat') {
    return (
      <View key={step.id} style={[modal.stepRow, { paddingLeft: depth * 12 }]}>
        <VirraText variant="mono" size={11} color={colors.pulse}>
          {step.repeat_count} ×
        </VirraText>
        <View style={modal.repeatChildren}>
          {step.sub_steps?.map((ss: any) => renderRunStep(ss, depth + 1))}
        </View>
      </View>
    );
  }
  const distM = step.target.distance_m;
  const durS  = step.target.duration_s;
  const pace  = step.target.pace_secs_per_km;
  const distText = distM
    ? distM >= 1000 ? `${(distM / 1000).toFixed(1)}km` : `${distM}m`
    : durS ? `${Math.round(durS / 60)}min` : '';
  const paceText = pace ? ` @ ${formatPace(pace)}` : '';
  return (
    <View key={step.id} style={[modal.stepRow, { paddingLeft: depth * 12 }]}>
      <VirraText variant="mono" size={11} color={colors.muted} style={modal.stepKind}>
        {step.kind.toUpperCase()}
      </VirraText>
      <VirraText variant="body" size={13} color={colors.breath} style={{ flex: 1 }}>
        {step.label ? `${step.label} · ` : ''}{distText}{paceText}
      </VirraText>
    </View>
  );
}

export function SessionDetailModal({ visible, date, userId, cycleStore, onClose, onMutate }: Props) {
  const [detail, setDetail]       = useState<DayDetail | null>(null);
  const [loading, setLoading]     = useState(false);
  const [busy, setBusy]           = useState(false);
  const [noFreeDay, setNoFreeDay] = useState<Record<string, boolean>>({});
  const cycleProfile = useCycleStore((s) => s.cycleProfile);

  useEffect(() => {
    if (visible && date) {
      setDetail(null);
      setNoFreeDay({});
      setLoading(true);
      getDaySessionDetail(userId, date, cycleStore, cycleProfile)
        .then(setDetail)
        .catch((e) => console.warn('[SessionDetailModal]', e))
        .finally(() => setLoading(false));
    }
  }, [visible, date]);

  const title = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  async function handleDrop(sessionId: string) {
    setBusy(true);
    try {
      await dropSession(sessionId);
      onMutate();
    } catch (e: unknown) {
      Alert.alert('Could not drop session', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveThisWeek(session: SessionDetail) {
    setBusy(true);
    try {
      const monday    = mondayOfISO(date);
      const jsDay     = new Date(`${date}T00:00:00Z`).getUTCDay();
      const dayIdx    = jsDay === 0 ? 6 : jsDay - 1;
      const weekDates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));

      const { data: occupied, error: queryErr } = await supabase
        .from('planned_sessions')
        .select('scheduled_date')
        .eq('user_id', userId)
        .eq('modality', session.kind)
        .eq('session_label', session.session_label)
        .in('status', ['planned', 'completed'])
        .in('scheduled_date', weekDates);

      if (queryErr) {
        Alert.alert('Could not check availability', queryErr.message);
        return;
      }

      const occupiedSet = new Set((occupied ?? []).map((r: any) => r.scheduled_date));
      occupiedSet.add(date);

      const freeDay = weekDates.slice(dayIdx + 1).find((d) => !occupiedSet.has(d));
      if (!freeDay) {
        setNoFreeDay((prev) => ({ ...prev, [session.planned_session_id]: true }));
        return;
      }

      await moveSession(session.planned_session_id, freeDay, userId);
      onMutate();
    } catch (e: unknown) {
      Alert.alert('Could not move session', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCatchup(sessionId: string) {
    setBusy(true);
    try {
      await moveSession(sessionId, shiftDate(date, 7), userId);
      onMutate();
    } catch (e: unknown) {
      Alert.alert('Could not move session', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  function renderSessionCard(s: SessionDetail, i: number) {
    const label = s.session_label.charAt(0).toUpperCase() + s.session_label.slice(1);
    const isRun = s.kind === 'run';
    const r     = s as RunSessionDetail;

    // Cycle modulation helpers — read-only, no recomputation
    const mod            = s.cycle_modulation;
    const hasWhyCard     = !!mod?.reason;
    const adjustedPaceSecs = isRun && hasWhyCard
      ? mod!.adjusted_target.pace_seconds_per_km ?? null
      : null;
    const basePaceSecs   = isRun && hasWhyCard ? r.pace_target_secs : null;
    // Display adjusted pace as primary for run sessions when a modulation reason exists
    const displayPaceSecs = (isRun && adjustedPaceSecs != null)
      ? adjustedPaceSecs
      : (isRun ? r.pace_target_secs : 0);

    return (
      <View key={s.planned_session_id} style={[modal.card, i > 0 && modal.cardBorder]}>
        <View style={modal.cardHeader}>
          <VirraText variant="bodyMedium" size={14} color={colors.breath}>{label}</VirraText>
          <VirraText variant="mono" size={11} color={colors.muted}>
            {s.kind.toUpperCase()}
          </VirraText>
        </View>

        {isRun && s.status !== 'dropped' && (
          <>
            {(s as RunSessionDetail).modulated_structure ? (
              <View style={modal.stepList}>
                {(s as RunSessionDetail).modulated_structure!.steps.map((step) =>
                  renderRunStep(step as any)
                )}
              </View>
            ) : (
              <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
                {s.status === 'completed' && r.actual_distance_km
                  ? `${r.actual_distance_km.toFixed(1)}km · ${r.actual_pace_secs ? formatPace(r.actual_pace_secs) : '—'} · actual`
                  : r.base_distance_km
                    ? `${r.base_distance_km.toFixed(1)} → ${r.distance_km.toFixed(1)}km · ${formatPace(displayPaceSecs)} · ~${r.estimated_minutes}min`
                    : `${r.distance_km.toFixed(1)}km · ${formatPace(displayPaceSecs)} · ~${r.estimated_minutes}min`}
              </VirraText>
            )}
            {hasWhyCard && adjustedPaceSecs != null && basePaceSecs != null && adjustedPaceSecs !== basePaceSecs && s.status !== 'completed' && (
              <VirraText variant="mono" size={11} color={colors.muted} style={modal.adjustedFrom}>
                ADJUSTED FROM {formatPace(basePaceSecs)}
              </VirraText>
            )}
          </>
        )}

        {!isRun && s.status !== 'dropped' && (
          <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
            ~{s.estimated_minutes}min
          </VirraText>
        )}

        {s.status === 'planned' && (
          <View style={modal.actions}>
            <Pressable style={modal.actionBtn} onPress={() => handleDrop(s.planned_session_id)} disabled={busy}>
              <SymbolView name="xmark.circle" size={12} tintColor={colors.heat} />
              <VirraText variant="mono" size={11} color={colors.heat}>DROP</VirraText>
            </Pressable>

            {noFreeDay[s.planned_session_id] ? (
              <VirraText variant="mono" size={11} color={colors.muted} style={{ flex: 1 }}>
                No free day this week — use Catch-Up to reschedule next week.
              </VirraText>
            ) : (
              <Pressable style={modal.actionBtn} onPress={() => handleMoveThisWeek(s)} disabled={busy}>
                <SymbolView name="arrow.left.arrow.right" size={12} tintColor={colors.muted} />
                <VirraText variant="mono" size={11} color={colors.muted}>MOVE THIS WEEK</VirraText>
              </Pressable>
            )}

            <Pressable style={modal.actionBtn} onPress={() => handleCatchup(s.planned_session_id)} disabled={busy}>
              <SymbolView name="calendar.badge.plus" size={12} tintColor={colors.pulse} />
              <VirraText variant="mono" size={11} color={colors.pulse}>CATCH-UP</VirraText>
            </Pressable>
          </View>
        )}

        {s.status === 'completed' && (
          <View style={modal.statusRow}>
            <SymbolView name="checkmark.circle.fill" size={12} tintColor={colors.pulse} />
            <VirraText variant="mono" size={11} color={colors.pulse}>COMPLETED</VirraText>
          </View>
        )}

        {s.status === 'dropped' && (
          <VirraText variant="mono" size={11} color={colors.muted}>DROPPED</VirraText>
        )}

        {hasWhyCard && (
          <VirraCard style={modal.whyCard}>
            <VirraText variant="mono" size={11} color={colors.pulse} style={modal.whyLabel}>
              WHY THIS PACE
            </VirraText>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={modal.whyText}>
              {mod!.reason}
            </VirraText>
          </VirraCard>
        )}
      </View>
    );
  }

  function renderEventCard(evt: UserEvent) {
    const daysUntil = Math.ceil(
      (new Date(`${evt.event_date}T00:00:00`).getTime() - Date.now()) / 86400000
    );
    return (
      <View key={evt.id} style={[modal.card, modal.cardBorder]}>
        <View style={modal.cardHeader}>
          <SymbolView
            name="flag.fill"
            size={12}
            tintColor={(evt.priority === 1 ? colors.heat : colors.dawn) as any}
          />
          <VirraText variant="bodyMedium" size={14} color={colors.breath}>{evt.name}</VirraText>
        </View>
        {evt.target_finish_time && (
          <VirraText variant="mono" size={10} color={colors.muted}>
            Target: {evt.target_finish_time}
          </VirraText>
        )}
        {daysUntil >= 0 && (
          <VirraText variant="mono" size={11} color={colors.muted}>
            {daysUntil === 0 ? 'Today!' : `${daysUntil} days away`}
          </VirraText>
        )}
      </View>
    );
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title={title}>
      {/* Phase banner */}
      {detail?.phase && (
        <View style={modal.phaseBanner}>
          <VirraText
            variant="mono"
            size={11}
            color={PHASE_COLOR[detail.phase] ?? colors.muted}
            style={{ letterSpacing: 1.5 }}
          >
            {detail.phase.toUpperCase()} · {detail.phase_guidance}
          </VirraText>
        </View>
      )}

      {/* Volume adjustment note */}
      {!loading && detail?.volume_adjustment_note && (
        <VirraText
          variant="mono"
          size={11}
          color={colors.muted}
          style={{ marginBottom: spacing.xs }}
        >
          {detail.volume_adjustment_note}
        </VirraText>
      )}

      {/* Loading */}
      {loading && (
        <View style={modal.loadingWrap}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}

      {/* Sessions */}
      {!loading && detail && detail.sessions.map((s, i) => renderSessionCard(s, i))}

      {/* Events (race day info) */}
      {!loading && detail?.events.map((evt) => renderEventCard(evt))}

      {/* Empty state */}
      {!loading && detail && detail.sessions.length === 0 && detail.events.length === 0 && (
        <VirraText variant="body" size={13} color={colors.muted}>
          No sessions scheduled for this day.
        </VirraText>
      )}

      {/* Deficit coaching message */}
      {!loading && detail?.volume_plan.deficit_message && (
        <VirraText
          variant="body"
          size={13}
          color={colors.dawn}
          style={modal.deficitMsg}
        >
          {detail.volume_plan.deficit_message}
        </VirraText>
      )}

      <VirraButton label="Close" variant="ghost" onPress={onClose} style={{ marginTop: spacing.md }} />
    </VirraModal>
  );
}

const modal = StyleSheet.create({
  phaseBanner: {
    backgroundColor: colors.mist,
    borderRadius:    radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom:    spacing.sm,
  },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  card:        { gap: spacing.xs, paddingVertical: spacing.sm },
  cardBorder:  { borderTopWidth: 1, borderTopColor: colors.border },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  detail:      { letterSpacing: 0.3 },
  actions:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  actionBtn:   {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deficitMsg:   { marginTop: spacing.md, lineHeight: 20 },
  whyCard:      { gap: spacing.xs, marginTop: spacing.sm },
  whyLabel:     { letterSpacing: 1.5 },
  whyText:      { lineHeight: 20 },
  adjustedFrom: { letterSpacing: 1, marginTop: 2 },
  stepList:     { gap: 2, marginTop: spacing.xs },
  stepRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  stepKind:     { width: 70 },
  repeatChildren: { flex: 1, gap: 2 },
});
