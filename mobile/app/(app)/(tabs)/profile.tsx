import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView,
  Pressable, Alert, TextInput, Image,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore, type CycleProfile } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraModal } from '@/components/ui/VirraModal';
import { BreakModal } from '@/components/ui/BreakModal';
import { getActiveBlocks, type TrainingBlock } from '@/lib/trainingBlocks';

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


const row = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  label: { letterSpacing: 1.5 },
});

const CYCLE_PROFILE_LABEL: Record<CycleProfile, string> = {
  natural:       'Regular cycle',
  hormonal:      'Hormonal contraception',
  irregular:     'Irregular cycle',
  perimenopause: 'Perimenopause',
  menopause:     'Menopause',
};

export default function ProfileScreen() {
  const { session, signOut }   = useAuthStore();
  const { status }             = useSubscriptionStore();
  const { cycleInfo, periodStart, cycleLength, setCycleLength, setPeriodStart, cycleProfile } = useCycleStore();
  const { firstName, lastName, avatarUrl, save: saveProfile } = useProfileStore();

  const [saving,  setSaving]  = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cycleLengthModalVisible, setCycleLengthModalVisible] = useState(false);
  const [cycleLengthInput, setCycleLengthInput] = useState('');
  const [cycleLengthError, setCycleLengthError] = useState('');
  const [lastBreak,      setLastBreak]      = useState<{ break_start: string; break_end: string } | null>(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [profileBlocks,  setProfileBlocks]  = useState<TrainingBlock[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('training_breaks')
        .select('break_start, break_end')
        .eq('user_id', session.user.id)
        .order('break_start', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setLastBreak(data ?? null));
      getActiveBlocks(session.user.id).then(setProfileBlocks);
    }, [session]),
  );

  const displayName      = [firstName, lastName].filter(Boolean).join(' ') || 'Runner';
  const initials         = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const showCycleDetails = cycleProfile === 'natural' || cycleProfile === 'irregular';

  function fmtBreakRange(start: string, end: string): string {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end   + 'T00:00:00');
    const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.getDate()}–${eStr}`;
    }
    return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${eStr}`;
  }

  const todayISO     = new Date().toLocaleDateString('en-CA');
  const breakSummary = lastBreak
    ? (lastBreak.break_start >= todayISO
      ? fmtBreakRange(lastBreak.break_start, lastBreak.break_end)
      : `Last: ${fmtBreakRange(lastBreak.break_start, lastBreak.break_end)}`)
    : 'None scheduled';

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
      const uri     = result.assets[0].uri;
      const path    = `${session.user.id}/avatar.jpg`;
      const res     = await fetch(uri);
      const blob    = await res.blob();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      await saveProfile(session.user.id, { avatarUrl: `${urlData.publicUrl}?t=${Date.now()}` });
    } catch (e) {
      Alert.alert('Could not update photo', (e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
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
      setCycleLengthError('Enter a number between 21 and 40.');
      return;
    }
    setCycleLengthError('');
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
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/(app)/settings' as any)} hitSlop={12}>
            <SymbolView name="gearshape" size={18} tintColor={colors.muted} />
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <SymbolView name="xmark" size={18} tintColor={colors.muted} />
          </Pressable>
        </View>
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
          <Row
            label="STATUS"
            value={subLabel[status] ?? status}
            onPress={() => router.push('/(app)/subscription')}
          />
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>CYCLE</VirraText>
          <Row
            label="CYCLE PROFILE"
            value={CYCLE_PROFILE_LABEL[cycleProfile]}
            onPress={() => router.push('/(app)/cycle-settings')}
          />
          {showCycleDetails && (
            <>
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
            </>
          )}
        </VirraCard>

        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>TRAINING</VirraText>
          <Row
            label="BREAKS"
            value={breakSummary}
            onPress={() => router.push('/(app)/breaks' as any)}
          />
        </VirraCard>

        <VirraButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signout}
        />

        {session && (
          <BreakModal
            visible={showBreakModal}
            userId={session.user.id}
            onClose={() => setShowBreakModal(false)}
            onApplied={() => {
              setShowBreakModal(false);
              supabase
                .from('training_breaks')
                .select('break_start, break_end')
                .eq('user_id', session.user.id)
                .order('break_start', { ascending: false })
                .limit(1)
                .maybeSingle()
                .then(({ data }) => setLastBreak(data ?? null));
            }}
          />
        )}
      </ScrollView>

      {/* Cycle length modal */}
      <VirraModal
        visible={cycleLengthModalVisible}
        onClose={() => { setCycleLengthModalVisible(false); setCycleLengthError(''); }}
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
          style={styles.modalInput}
          placeholderTextColor="rgba(244,237,224,0.3)"
        />
        {cycleLengthError ? (
          <VirraText variant="mono" size={10} color={colors.heat} style={{ letterSpacing: 1 }}>
            {cycleLengthError.toUpperCase()}
          </VirraText>
        ) : null}
        <VirraButton label="SAVE" onPress={handleCycleLengthSave} loading={saving} />
      </VirraModal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.mile },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 52 },
  headerActions:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
