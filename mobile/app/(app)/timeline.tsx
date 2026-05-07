import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { ActivityRow, type Activity } from '@/components/ui/ActivityRow';

interface Group { label: string; activities: Activity[] }

function groupByDate(activities: Activity[]): Group[] {
  const now       = new Date();
  const todayStr  = now.toDateString();
  const yest      = new Date(now); yest.setDate(now.getDate() - 1);
  const yesterStr = yest.toDateString();
  const map       = new Map<string, Activity[]>();

  for (const a of activities) {
    const d   = new Date(a.started_at);
    const key = d.toDateString() === todayStr  ? 'Today'
              : d.toDateString() === yesterStr  ? 'Yesterday'
              : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  return Array.from(map.entries()).map(([label, acts]) => ({ label, activities: acts }));
}

const PAGE_SIZE = 30;

export default function TimelineScreen() {
  const { session }               = useAuthStore();
  const [groups,  setGroups]      = useState<Group[]>([]);
  const [loading, setLoading]     = useState(true);
  const [page,    setPage]        = useState(0);
  const [hasMore, setHasMore]     = useState(true);

  const load = useCallback(async (reset = false) => {
    if (!session) return;
    const offset = reset ? 0 : page * PAGE_SIZE;
    const { data } = await supabase
      .from('activities')
      .select('id, activity_type, started_at, duration_seconds, distance_meters, phase_at_time, run_details(avg_pace_seconds_per_km)')
      .eq('user_id', session.user.id)
      .order('started_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const rows = (data ?? []) as Activity[];
    setHasMore(rows.length === PAGE_SIZE);
    setGroups((prev) => {
      const all = reset ? rows : [...prev.flatMap((g) => g.activities), ...rows];
      return groupByDate(all);
    });
    if (!reset) setPage((p) => p + 1);
    setLoading(false);
  }, [session, page]);

  useFocusEffect(useCallback(() => {
    setPage(0);
    load(true);
  }, [session]));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={10} color={colors.muted}>ACTIVITY</VirraText>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <VirraText variant="mono" size={10} color={colors.muted}>LOADING…</VirraText>
        ) : groups.length === 0 ? (
          <VirraCard style={styles.empty}>
            <VirraText variant="serif" size={16} color={colors.breath} style={{ lineHeight: 24 }}>
              No activities yet. Complete a run or sync Apple Health to see your history here.
            </VirraText>
          </VirraCard>
        ) : (
          groups.map((group) => (
            <View key={group.label} style={styles.group}>
              <VirraText variant="mono" size={9} color={colors.pulse} style={styles.groupLabel}>
                {group.label.toUpperCase()}
              </VirraText>
              <VirraCard style={styles.groupCard}>
                {group.activities.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <ActivityRow activity={a} />
                  </View>
                ))}
              </VirraCard>
            </View>
          ))
        )}

        {hasMore && !loading && (
          <Pressable onPress={() => load()} style={styles.loadMore}>
            <VirraText variant="mono" size={10} color={colors.muted}>LOAD MORE</VirraText>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.push('/(app)/manual-activity' as any)}
          style={styles.manualLink}
          accessibilityRole="button"
        >
          <VirraText variant="mono" size={9} color="rgba(244,237,224,0.25)">
            Didn't have your watch? Log manually →
          </VirraText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.mile },
  header:     { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  backBtn:    { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:     { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  group:      { gap: spacing.xs },
  groupLabel: { letterSpacing: 1.5 },
  groupCard:  { gap: 0, paddingVertical: 0 },
  divider:    { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  empty:      { gap: spacing.sm },
  loadMore:   { alignItems: 'center', paddingVertical: spacing.lg },
  manualLink: { alignItems: 'center', paddingVertical: spacing.lg },
});
