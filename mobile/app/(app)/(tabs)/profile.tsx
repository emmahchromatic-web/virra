import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView,
  Pressable, Alert, Switch, TextInput, Image,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
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
import { VirraModal } from '@/components/ui/VirraModal';

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
  const { firstName, lastName, avatarUrl, save: saveProfile } = useProfileStore();

  const [saving,  setSaving]  = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cycleLengthModalVisible, setCycleLengthModalVisible] = useState(false);
  const [cycleLengthInput, setCycleLengthInput] = useState('');
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    training: true, breakfast: true, lunch: true, dinner: true, checkin: true,
  });

  useEffect(() => {
    loadNotificationPreferences().then(setNotifPrefs);
  }, []);

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Runner';
  const initials    = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  async function handlePickAvatar() {
    if (!session) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:    'images',
      allowsEditing: true,
      aspect:        [1, 1],
      quality:       0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const uri      = result.assets[0].uri;
      const path     = `${session.user.id}/avatar.jpg`;
      const formData = new FormData();
      formData.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, formData, { contentType: 'multipart/form-data', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      await saveProfile(session.user.id, { avatarUrl: urlData.publicUrl });
    } catch (e) {
      Alert.alert('Could not update photo', (e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

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

  async function handleCycleLengthSave() {
    const days = parseInt(cycleLengthInput, 10);
    if (isNaN(days) || days < 21 || days > 40) {
      Alert.alert('Invalid value', 'Enter a number between 21 and 40.');
      return;
    }
    setCycleLengthModalVisible(false);
    await updateCycleLength(days);
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

        {/* Identity */}
        <VirraCard style={styles.card}>
          <View style={styles.identityRow}>
            <Pressable onPress={handlePickAvatar} style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={[styles.avatarImg, styles.avatarPlaceholder]}>
                  <VirraText variant="mono" size={20} color={colors.pulse}>{initials}</VirraText>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <SymbolView name="camera.fill" size={10} tintColor={colors.mile} />
              </View>
            </Pressable>
            <View style={styles.identityText}>
              <VirraText variant="display" size={18} color={colors.breath}>{displayName}</VirraText>
              {uploadingAvatar && (
                <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1, marginTop: 2 }}>
                  UPDATING PHOTO…
                </VirraText>
              )}
            </View>
          </View>
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>ACCOUNT</VirraText>
          <Row label="EMAIL" value={session?.user.email ?? '—'} />
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>SUBSCRIPTION</VirraText>
          <Row label="STATUS" value={subLabel[status] ?? status} />
          <Row label="MANAGE" value="Settings → Subscriptions" onPress={() => setSubModalVisible(true)} />
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
            onPress={() => { setCycleLengthInput(String(cycleLength)); setCycleLengthModalVisible(true); }}
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

      {/* Cycle length modal */}
      <VirraModal
        visible={cycleLengthModalVisible}
        onClose={() => setCycleLengthModalVisible(false)}
        title="Cycle Length"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          Enter your average cycle length in days (21–40)
        </VirraText>
        <TextInput
          value={cycleLengthInput}
          onChangeText={setCycleLengthInput}
          keyboardType="number-pad"
          maxLength={2}
          autoFocus
          selectTextOnFocus
          style={styles.modalInput}
          placeholderTextColor="rgba(244,237,224,0.3)"
        />
        <VirraButton label="SAVE" onPress={handleCycleLengthSave} loading={saving} />
      </VirraModal>

      {/* Subscription modal */}
      <VirraModal
        visible={subModalVisible}
        onClose={() => setSubModalVisible(false)}
        title="Manage Subscription"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)">
          Open Settings → Subscriptions to manage your plan.
        </VirraText>
        <VirraButton label="OK" variant="ghost" onPress={() => setSubModalVisible(false)} />
      </VirraModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.mile },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 52 },
  scroll:            { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card:              { gap: spacing.xs },
  cardLabel:         { letterSpacing: 1.5, marginBottom: spacing.xs },
  divider:           { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  signout:           { marginTop: spacing.md },
  identityRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarWrap:        { position: 'relative' },
  avatarImg:         { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: { backgroundColor: colors.mile, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cameraBadge:       { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.pulse, alignItems: 'center', justifyContent: 'center' },
  identityText:      { flex: 1 },
  modalInput:        { backgroundColor: colors.mile, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.breath, fontFamily: 'SpaceMono_400Regular', fontSize: 24, textAlign: 'center', paddingVertical: spacing.md },
});
