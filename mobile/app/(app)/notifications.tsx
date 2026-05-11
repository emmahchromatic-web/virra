import React, { useEffect, useState } from 'react';
import { View, ScrollView, Switch, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  loadNotificationPreferences,
  setNotificationPreference,
  type NotificationPreferences,
  type NotifSlot,
} from '@/lib/notifications';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

const NOTIF_ROWS: { slot: NotifSlot; label: string; sublabel: string }[] = [
  { slot: 'training',  label: 'Training reminder',  sublabel: 'Adaptive · based on your history · cancels when workout logged' },
  { slot: 'breakfast', label: 'Breakfast reminder', sublabel: 'Daily at 8:00 am · cancels when meal logged' },
  { slot: 'lunch',     label: 'Lunch reminder',     sublabel: 'Daily at 12:30 pm · cancels when meal logged' },
  { slot: 'dinner',    label: 'Dinner reminder',    sublabel: 'Daily at 7:00 pm · cancels when meal logged' },
  { slot: 'checkin',  label: 'Daily check-in',      sublabel: 'Daily at 8:00 pm · cancels when check-in submitted' },
];

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    training: true, breakfast: true, lunch: true, dinner: true, checkin: true,
  });

  useEffect(() => { loadNotificationPreferences().then(setPrefs); }, []);

  async function handleToggle(slot: NotifSlot, enabled: boolean) {
    setPrefs((p) => ({ ...p, [slot]: enabled }));
    await setNotificationPreference(slot, enabled);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={11} color={colors.breath} style={s.title}>NOTIFICATIONS</VirraText>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <VirraCard style={s.card}>
          {NOTIF_ROWS.map((item, i) => (
            <React.Fragment key={item.slot}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <VirraText variant="body" size={14} color={colors.breath}>{item.label}</VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted} style={s.sublabel}>
                    {item.sublabel}
                  </VirraText>
                </View>
                <Switch
                  value={prefs[item.slot]}
                  onValueChange={(v) => handleToggle(item.slot, v)}
                  trackColor={{ false: colors.border, true: `${colors.pulse}99` }}
                  thumbColor={prefs[item.slot] ? colors.pulse : 'rgba(244,237,224,0.4)'}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </React.Fragment>
          ))}
        </VirraCard>
      </ScrollView>
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
  row:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  sublabel: { marginTop: 2, letterSpacing: 0 },
  divider:  { height: 1, backgroundColor: colors.border, marginVertical: 2 },
});
