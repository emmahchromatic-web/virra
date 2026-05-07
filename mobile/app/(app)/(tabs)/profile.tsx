import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert, Switch } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore } from '@/store/cycle';
import { supabase } from '@/lib/supabase';
import {
  loadNotificationPreferences,
  setNotificationPreference,
  type NotificationPreferences,
  type NotifSlot,
} from '@/lib/notifications';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';

function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={row.wrap}>
      <View style={{ flex: 1 }}>
        <VirraText variant="mono" size={9} color={colors.muted} style={row.label}>{label}</VirraText>
        <VirraText variant="body" size={15} color={colors.breath} style={{ marginTop: 2 }}>{value}</VirraText>
      </View>
      {onPress && <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />}
    </Pressable>
  );
}

function NotifRow({
  label, sublabel, value, onToggle,
}: { label: string; sublabel: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={row.wrap}>
      <View style={{ flex: 1 }}>
        <VirraText variant="body" size={14} color={colors.breath}>{label}</VirraText>
        <VirraText variant="mono" size={9} color={colors.muted} style={{ marginTop: 2, letterSpacing: 0 }}>{sublabel}</VirraText>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: `${colors.pulse}99` }}
        thumbColor={value ? colors.pulse : 'rgba(244,237,224,0.4)'}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

const row = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  label: { letterSpacing: 1.5 },
});

export default function ProfileScreen() {
  const { session, signOut }   = useAuthStore();
  const { status }             = useSubscriptionStore();
  const { cycleInfo, periodStart, cycleLength, setCycleLength, setPeriodStart } = useCycleStore();
  const [saving,  setSaving]  = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    training: true, breakfast: true, lunch: true, dinner: true, checkin: true,
  });

  useEffect(() => {
    loadNotificationPreferences().then(setNotifPrefs);
  }, []);

  async function handleNotifToggle(slot: NotifSlot, enabled: boolean) {
    setNotifPrefs((p) => ({ ...p, [slot]: enabled }));
    await setNotificationPreference(slot, enabled);
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)');
  }

  async function updateCycleLength(days: number) {
    if (!session) return;
    setSaving(true);
    setCycleLength(days);
    const { error } = await supabase
      .from('cycle_logs')
      .update({ cycle_length_days: days })
      .eq('user_id', session.user.id)
      .order('period_start', { ascending: false })
      .limit(1);
    setSaving(false);
    if (error) Alert.alert('Could not update', error.message);
  }

  function showCycleLengthPicker() {
    Alert.prompt(
      'Cycle length',
      'Enter your average cycle length in days (21–40)',
      (input) => {
        const days = parseInt(input, 10);
        if (!isNaN(days) && days >= 21 && days <= 40) {
          updateCycleLength(days);
        } else {
          Alert.alert('Invalid value', 'Enter a number between 21 and 40.');
        }
      },
      'plain-text',
      String(cycleLength),
    );
  }

  const subLabel: Record<string, string> = {
    trial:     'Free trial active',
    active:    'Subscribed',
    expired:   'Subscription expired',
    cancelled: 'Cancelled',
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <VirraText variant="display" size={24} color={colors.pulse}>Profile</VirraText>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor={colors.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>ACCOUNT</VirraText>
          <Row label="EMAIL" value={session?.user.email ?? '—'} />
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>SUBSCRIPTION</VirraText>
          <Row label="STATUS" value={subLabel[status] ?? status} />
          <Row label="MANAGE" value="Settings → Subscriptions" onPress={() => Alert.alert('Open Settings → Subscriptions to manage your plan.')} />
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>CYCLE</VirraText>
          <Row
            label="CURRENT PHASE"
            value={cycleInfo ? `${cycleInfo.phase.charAt(0).toUpperCase() + cycleInfo.phase.slice(1)} · Day ${cycleInfo.dayOfCycle}` : 'Not set'}
          />
          <Row
            label="LAST PERIOD"
            value={periodStart ? periodStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}
          />
          <Row
            label="CYCLE LENGTH"
            value={`${cycleLength} days`}
            onPress={showCycleLengthPicker}
          />
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>NOTIFICATIONS</VirraText>
          <NotifRow
            label="Training reminder"
            sublabel="Daily at 9:00 am · cancels when workout logged"
            value={notifPrefs.training}
            onToggle={(v) => handleNotifToggle('training', v)}
          />
          <View style={styles.divider} />
          <NotifRow
            label="Breakfast reminder"
            sublabel="Daily at 8:00 am · cancels when meal logged"
            value={notifPrefs.breakfast}
            onToggle={(v) => handleNotifToggle('breakfast', v)}
          />
          <View style={styles.divider} />
          <NotifRow
            label="Lunch reminder"
            sublabel="Daily at 12:30 pm · cancels when meal logged"
            value={notifPrefs.lunch}
            onToggle={(v) => handleNotifToggle('lunch', v)}
          />
          <View style={styles.divider} />
          <NotifRow
            label="Dinner reminder"
            sublabel="Daily at 7:00 pm · cancels when meal logged"
            value={notifPrefs.dinner}
            onToggle={(v) => handleNotifToggle('dinner', v)}
          />
          <View style={styles.divider} />
          <NotifRow
            label="Daily check-in"
            sublabel="Daily at 8:00 pm · cancels when check-in submitted"
            value={notifPrefs.checkin}
            onToggle={(v) => handleNotifToggle('checkin', v)}
          />
        </VirraCard>

        <VirraButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signout}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 52 },
  scroll:    { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card:      { gap: spacing.xs },
  cardLabel: { letterSpacing: 1.5, marginBottom: spacing.xs },
  divider:   { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  signout:   { marginTop: spacing.md },
});
