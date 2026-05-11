import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { getActiveBlocks, type TrainingBlock } from '@/lib/trainingBlocks';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { BreakModal } from '@/components/ui/BreakModal';

interface BreakRecord {
  id:          string;
  break_start: string;
  break_end:   string;
  mode:        'reschedule' | 'skip';
  block_ids:   string[];
  applied_at:  string;
}

function fmtBreakRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${eStr}`;
  }
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${eStr}`;
}

export default function BreaksScreen() {
  const { session }                     = useAuthStore();
  const [breaks,       setBreaks]       = useState<BreakRecord[]>([]);
  const [activeBlocks, setActiveBlocks] = useState<TrainingBlock[]>([]);
  const [showModal,    setShowModal]    = useState(false);
  const todayISO = new Date().toLocaleDateString('en-CA');

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      load();
    }, [session]),
  );

  async function load() {
    if (!session) return;
    const [breaksRes, blocks] = await Promise.all([
      supabase
        .from('training_breaks')
        .select('id, break_start, break_end, mode, block_ids, applied_at')
        .eq('user_id', session.user.id)
        .order('break_start', { ascending: false }),
      getActiveBlocks(session.user.id),
    ]);
    setBreaks((breaksRes.data ?? []) as BreakRecord[]);
    setActiveBlocks(blocks);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={11} color={colors.breath} style={s.title}>BREAKS</VirraText>
        <Pressable onPress={() => setShowModal(true)} hitSlop={12}>
          <SymbolView name="plus" size={18} tintColor={colors.pulse} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {breaks.length === 0 ? (
          <VirraCard style={s.card}>
            <VirraText variant="body" size={13} color={colors.muted}>
              No breaks recorded. Long-press any day in your training calendar to schedule one.
            </VirraText>
          </VirraCard>
        ) : (
          <VirraCard style={s.card}>
            {breaks.map((b, i) => {
              const isUpcoming = b.break_start >= todayISO;
              return (
                <View key={b.id}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.breakRow}>
                    <View style={{ flex: 1 }}>
                      <VirraText variant="body" size={14} color={colors.breath}>
                        {fmtBreakRange(b.break_start, b.break_end)}
                      </VirraText>
                      <View style={s.badges}>
                        <View style={s.badge}>
                          <VirraText variant="mono" size={8} color={colors.muted}>
                            {b.mode === 'reschedule' ? 'RESCHEDULED' : 'SKIPPED'}
                          </VirraText>
                        </View>
                        <VirraText variant="mono" size={8} color={colors.muted}>
                          {b.block_ids.length} block{b.block_ids.length !== 1 ? 's' : ''}
                        </VirraText>
                      </View>
                    </View>
                    <SymbolView
                      name={isUpcoming ? 'clock' : 'checkmark.circle'}
                      size={14}
                      tintColor={isUpcoming ? colors.muted : colors.pulse}
                    />
                  </View>
                </View>
              );
            })}
          </VirraCard>
        )}
      </ScrollView>

      {session && (
        <BreakModal
          visible={showModal}
          userId={session.user.id}
          onClose={() => setShowModal(false)}
          onApplied={() => { setShowModal(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: colors.mile },
  header:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, height: 52,
  },
  title:    { letterSpacing: 1.5 },
  scroll:   { padding: spacing.lg, gap: spacing.md },
  card:     { gap: spacing.xs },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  badges:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  badge:    {
    paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  divider:  { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
});
