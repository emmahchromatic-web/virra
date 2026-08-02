import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Switch, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getUnitSystem, setUnitSystem, type UnitSystem } from '@/lib/units';
import {
  loadNotificationPreferences,
  setNotificationPreference,
  scheduleWeeklyPlanReminder,
  type NotificationPreferences,
  type NotifSlot,
} from '@/lib/notifications';
import { getPermissionsStatus } from '@/lib/permissionsConfig';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

const NOTIF_ROWS: { slot: NotifSlot; label: string; sublabel: string }[] = [
  { slot: 'weeklyPlan', label: 'Weekly planning',   sublabel: 'Every Sunday at 6:00 pm · review and adjust next week\'s sessions' },
  { slot: 'training',   label: 'Training reminder', sublabel: 'Adaptive · based on your history · cancels when workout logged' },
  { slot: 'breakfast',  label: 'Breakfast reminder',sublabel: 'Daily at 8:00 am · cancels when meal logged' },
  { slot: 'lunch',      label: 'Lunch reminder',    sublabel: 'Daily at 12:30 pm · cancels when meal logged' },
  { slot: 'dinner',     label: 'Dinner reminder',   sublabel: 'Daily at 7:00 pm · cancels when meal logged' },
  { slot: 'checkin',    label: 'Daily check-in',    sublabel: 'Daily at 8:00 pm · cancels when check-in submitted' },
];

export default function SettingsScreen() {
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    training: true, breakfast: true, lunch: true, dinner: true, checkin: true, weeklyPlan: true,
  });
  const [permissionsSummary, setPermissionsSummary] = useState({ granted: 0, total: 0 });

  useEffect(() => {
    getUnitSystem().then(setUnits);
    loadNotificationPreferences().then(setNotifPrefs);
    scheduleWeeklyPlanReminder();
    getPermissionsStatus().then((entries) => {
      setPermissionsSummary({
        granted: entries.filter((e) => e.status === 'granted').length,
        total:   entries.length,
      });
    });
  }, []);

  async function handleUnitChange(system: UnitSystem) {
    setUnits(system);
    await setUnitSystem(system);
  }

  async function handleNotifToggle(slot: NotifSlot, enabled: boolean) {
    setNotifPrefs((p) => ({ ...p, [slot]: enabled }));
    await setNotificationPreference(slot, enabled);
    if (slot === 'weeklyPlan') await scheduleWeeklyPlanReminder();
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Settings</VirraText>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <VirraCard style={s.card}>
          <VirraText variant="mono" size={11} color={colors.muted} style={s.cardLabel}>NOTIFICATIONS</VirraText>
          {NOTIF_ROWS.map((item, i) => (
            <React.Fragment key={item.slot}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.notifRow}>
                <View style={{ flex: 1 }}>
                  <VirraText variant="body" size={14} color={colors.breath}>{item.label}</VirraText>
                  <VirraText variant="mono" size={11} color={colors.muted} style={s.sublabel}>
                    {item.sublabel}
                  </VirraText>
                </View>
                <Switch
                  value={notifPrefs[item.slot]}
                  onValueChange={(v) => handleNotifToggle(item.slot, v)}
                  trackColor={{ false: colors.border, true: `${colors.pulse}99` }}
                  thumbColor={notifPrefs[item.slot] ? colors.pulse : 'rgba(244,237,224,0.4)'}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </React.Fragment>
          ))}
        </VirraCard>

        <VirraCard style={s.card}>
          <VirraText variant="mono" size={11} color={colors.muted} style={s.cardLabel}>DEVICE</VirraText>
          <Pressable style={s.row} onPress={() => router.push('/(app)/permissions-status' as any)} accessibilityRole="button">
            <VirraText variant="body" size={14} color={colors.breath} style={{ flex: 1 }}>Permissions</VirraText>
            <VirraText variant="mono" size={11} color={colors.muted}>{permissionsSummary.granted} of {permissionsSummary.total} granted</VirraText>
            <SymbolView name="chevron.right" size={12} tintColor={colors.muted} />
          </Pressable>
        </VirraCard>

        <VirraCard style={s.card}>
          <VirraText variant="mono" size={11} color={colors.muted} style={s.cardLabel}>UNITS</VirraText>
          <View style={s.segmentRow}>
            {(['metric', 'imperial'] as UnitSystem[]).map((option) => (
              <Pressable
                key={option}
                style={[s.segment, units === option && s.segmentActive]}
                onPress={() => handleUnitChange(option)}
              >
                <VirraText variant="mono" size={10} color={units === option ? colors.mile : colors.muted}>
                  {option === 'metric' ? 'METRIC' : 'IMPERIAL'}
                </VirraText>
                <VirraText variant="mono" size={10} color={units === option ? colors.mile : colors.border} style={{ marginTop: 2 }}>
                  {option === 'metric' ? 'km · kg' : 'mi · lb'}
                </VirraText>
              </Pressable>
            ))}
          </View>
        </VirraCard>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.mile },
  header:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, height: 52,
  },
  backBtn:       { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  title:         { letterSpacing: 1.5 },
  scroll:        { padding: spacing.lg, gap: spacing.md },
  card:          { gap: spacing.xs },
  cardLabel:     { letterSpacing: 1.5, marginBottom: spacing.xs },
  row:           { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  notifRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  sublabel:      { marginTop: 2, letterSpacing: 0 },
  divider:       { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  segmentRow:    { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  segment: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.mist,
  },
  segmentActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
});
