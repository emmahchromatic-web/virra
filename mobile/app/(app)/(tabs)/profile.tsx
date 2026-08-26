import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView,
  Pressable, TextInput, Image, Linking, Switch, Share, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore, type CycleProfile } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { INJURY_LEVELS, INJURY_LABEL, type InjuryLevel } from '@/lib/injuryLevels';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraModal } from '@/components/ui/VirraModal';
import { appAlert } from '@/components/ui/VirraAlert';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { BreakModal } from '@/components/ui/BreakModal';
import { WeightExplainerModal } from '@/components/ui/WeightExplainerModal';
import { getActiveBlocks, type TrainingBlock } from '@/lib/trainingBlocks';
import type { Sex } from '@/lib/nutritionTargets';
import { enableWeightTracking, readWeightSyncDiagnostic, type WeightSyncDiagnostic } from '@/lib/healthKitWeight';

function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={row.wrap}>
      <View style={{ flex: 1 }}>
        <VirraText variant="mono" size={11} color={colors.muted} style={row.label}>{label}</VirraText>
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
  natural:             'Regular cycle',
  hormonal:            'Hormonal contraception',
  irregular:           'Irregular cycle',
  perimenopause:       'Perimenopause',
  menopause:           'Menopause',
  pregnant_postpartum: 'Pregnant or postpartum',
  prefer_not_to_say:   'Prefer not to say',
};

// supabase.functions.invoke only surfaces a generic "non-2xx status code" message.
// Our Edge Functions return { error } in the response body; read it out so a
// failure is diagnosable instead of opaque.
async function functionErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      // body wasn't JSON: fall back to the generic message below
    }
  }
  return (error as Error).message ?? 'Unknown error';
}

export default function ProfileScreen() {
  const { session, signOut }   = useAuthStore();
  const { status }             = useSubscriptionStore();
  const { cycleInfo, periodStart, cycleLength, setCycleLength, setPeriodStart, cycleProfile } = useCycleStore();
  const { firstName, lastName, avatarUrl, stepsTarget, workoutPreference, save: saveProfile, trackWeight, heightCm, dateOfBirth, sex, injuryLevel, weightExplainerDismissedAt, bumpWeightDataVersion } = useProfileStore();
  const [weightSyncing, setWeightSyncing] = useState(false);
  const [weightSyncNote, setWeightSyncNote] = useState<string | null>(null);
  const [weightDiag, setWeightDiag] = useState<WeightSyncDiagnostic | null>(null);

  const [saving,  setSaving]  = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cycleLengthModalVisible, setCycleLengthModalVisible] = useState(false);
  const [cycleLengthInput, setCycleLengthInput] = useState('');
  const [cycleLengthError, setCycleLengthError] = useState('');
  const [stepsModalVisible, setStepsModalVisible] = useState(false);
  const [stepsInput,        setStepsInput]        = useState('');
  const [stepsError,        setStepsError]        = useState('');
  const [heightModalVisible, setHeightModalVisible] = useState(false);
  const [heightInput,        setHeightInput]        = useState('');
  const [heightError,        setHeightError]        = useState('');
  const [dobModalVisible,    setDobModalVisible]    = useState(false);
  const [dobDraft,           setDobDraft]           = useState<Date | null>(null);
  const [lastBreak,      setLastBreak]      = useState<{ break_start: string; break_end: string } | null>(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [profileBlocks,  setProfileBlocks]  = useState<TrainingBlock[]>([]);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [firstNameInput,   setFirstNameInput]   = useState('');
  const [lastNameInput,    setLastNameInput]    = useState('');
  const [nameError,        setNameError]        = useState('');
  // Deleting an account is irreversible, so it takes two deliberate steps:
  // 'explain' spells out what goes and what stays, 'confirm' asks them to type it.
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStage,        setDeleteStage]        = useState<'explain' | 'confirm'>('explain');
  const [deleteConfirm,      setDeleteConfirm]      = useState('');
  const [deleting,           setDeleting]           = useState(false);
  const [sexModalVisible,    setSexModalVisible]    = useState(false);
  const [injuryModalVisible, setInjuryModalVisible] = useState(false);
  const [medicalModalVisible, setMedicalModalVisible] = useState(false);
  const [creditsModalVisible, setCreditsModalVisible] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  async function handleToggleWeight(next: boolean) {
    if (!session || weightSyncing) return;
    if (next && !weightExplainerDismissedAt) setShowExplainer(true);
    await saveProfile(session.user.id, { trackWeight: next });
    if (!next) {
      setWeightSyncNote(null);
      return;
    }
    setWeightSyncing(true);
    setWeightSyncNote(null);
    try {
      const imported = await enableWeightTracking({
        userId:      session.user.id,
        periodStart: periodStart ?? null,
        cycleLength: cycleLength ?? 28,
      });
      bumpWeightDataVersion();
      setWeightSyncNote(
        imported > 0
          ? `Synced ${imported} reading${imported === 1 ? '' : 's'} from Apple Health.`
          : 'No readings found in Apple Health. Add a reading manually, or check Settings → Privacy → Health to allow Weight.',
      );
      setWeightDiag(await readWeightSyncDiagnostic());
    } catch (e) {
      setWeightSyncNote('Could not reach Apple Health. We’ll keep trying in the background.');
    } finally {
      setWeightSyncing(false);
    }
  }

  // Surface the most recent HK weight-sync diagnostic so we can tell at a
  // glance whether the bridge ran, what it returned, and whether anything
  // landed in Supabase. This view is intentionally chatty during the
  // Phase G rollout: once stable we can move it behind a debug flag.
  useEffect(() => {
    if (!trackWeight) { setWeightDiag(null); return; }
    let cancelled = false;
    readWeightSyncDiagnostic().then((d) => { if (!cancelled) setWeightDiag(d); });
    return () => { cancelled = true; };
  }, [trackWeight]);

  async function handleDismissExplainer() {
    if (!session) return;
    setShowExplainer(false);
    await saveProfile(session.user.id, { weightExplainerDismissedAt: new Date().toISOString() });
  }

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

  function openNameModal() {
    setFirstNameInput(firstName ?? '');
    setLastNameInput(lastName ?? '');
    setNameError('');
    setNameModalVisible(true);
  }

  async function handleNameSave() {
    if (!session) return;
    const first = firstNameInput.trim();
    const last  = lastNameInput.trim();
    if (!first) {
      setNameError('Enter at least a first name.');
      return;
    }
    setNameError('');
    setNameModalVisible(false);
    setSaving(true);
    try { await saveProfile(session.user.id, { firstName: first, lastName: last }); }
    catch (e) { appAlert('Could not update', (e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleSexSave(next: Sex) {
    if (!session) return;
    setSaving(true);
    await saveProfile(session.user.id, { sex: next });
    setSaving(false);
    setSexModalVisible(false);
  }

  async function handleInjurySave(next: InjuryLevel) {
    if (!session) return;
    setSaving(true);
    await saveProfile(session.user.id, { injuryLevel: next });
    setSaving(false);
    setInjuryModalVisible(false);
  }

  function openDeleteModal() {
    setDeleteStage('explain');
    setDeleteConfirm('');
    setDeleteModalVisible(true);
  }

  function closeDeleteModal() {
    setDeleteModalVisible(false);
    setDeleteStage('explain');
    setDeleteConfirm('');
  }

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
      const uri  = result.assets[0].uri;
      const path = `${session.user.id}/avatar.jpg`;
      // `fetch(uri).then(r => r.blob())` is broken on React Native; Supabase
      // ends up uploading an empty/garbled body, the URL resolves but the
      // image never renders. Read the file as raw bytes instead.
      const bytes = await new File(uri).bytes();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      await saveProfile(session.user.id, { avatarUrl: `${urlData.publicUrl}?t=${Date.now()}` });
    } catch (e) {
      appAlert('Could not update photo', (e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)');
  }

  async function openExternal(url: string) {
    try { await Linking.openURL(url); }
    catch { appAlert('Could not open link', url); }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) throw new Error('Not signed in');
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw new Error(await functionErrorMessage(error));
      await signOut();
      router.replace('/(auth)');
    } catch (e) {
      appAlert('Could not delete account', (e as Error).message);
    } finally {
      setDeleting(false);
      closeDeleteModal();
    }
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
    if (error) appAlert('Could not update', error.message);
  }

  async function handleStepsTargetSave() {
    if (!session) return;
    const val = parseInt(stepsInput, 10);
    if (isNaN(val) || val < 1000 || val > 30000) {
      setStepsError('Enter a number between 1,000 and 30,000.');
      return;
    }
    setStepsError('');
    setStepsModalVisible(false);
    setSaving(true);
    try { await saveProfile(session.user.id, { stepsTarget: val }); }
    catch (e) { appAlert('Could not update', (e as Error).message); }
    finally { setSaving(false); }
  }

  function openHeightModal() {
    setHeightInput(heightCm != null ? String(heightCm) : '');
    setHeightError('');
    setHeightModalVisible(true);
  }

  async function handleHeightSave() {
    if (!session) return;
    const val = parseInt(heightInput, 10);
    if (isNaN(val) || val < 140 || val > 210) {
      setHeightError('Enter a height in cm between 140 and 210.');
      return;
    }
    setHeightError('');
    setHeightModalVisible(false);
    setSaving(true);
    try { await saveProfile(session.user.id, { heightCm: val }); }
    catch (e) { appAlert('Could not update', (e as Error).message); }
    finally { setSaving(false); }
  }

  function openDobModal() {
    setDobDraft(dateOfBirth ? new Date(dateOfBirth) : new Date(new Date().getFullYear() - 30, 0, 1));
    setDobModalVisible(true);
  }

  async function handleDobSave() {
    if (!session || !dobDraft) return;
    setDobModalVisible(false);
    setSaving(true);
    // Store as a plain 'YYYY-MM-DD' date (no time/zone), matching onboarding.
    try { await saveProfile(session.user.id, { dateOfBirth: dobDraft.toISOString().split('T')[0] }); }
    catch (e) { appAlert('Could not update', (e as Error).message); }
    finally { setSaving(false); }
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
            <Pressable
              style={styles.identityText}
              onPress={openNameModal}
              accessibilityRole="button"
              accessibilityLabel="Edit your name"
            >
              <View style={styles.identityNameRow}>
                <VirraText variant="display" size={18} color={colors.breath}>{displayName}</VirraText>
                <SymbolView name="pencil" size={13} tintColor={colors.muted} />
              </View>
              {uploadingAvatar && (
                <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1, marginTop: 2 }}>
                  UPDATING PHOTO…
                </VirraText>
              )}
            </Pressable>
          </View>
        </VirraCard>

        <Pressable
          style={styles.referCard}
          onPress={() => router.push('/(app)/achievements' as any)}
          accessibilityRole="button"
          accessibilityLabel="Achievements"
        >
          <SymbolView name="rosette" size={20} tintColor={colors.pulse} />
          <View style={{ flex: 1 }}>
            <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1 }}>ACHIEVEMENTS</VirraText>
            <VirraText variant="body" size={12} color={colors.muted} style={{ marginTop: 2 }}>Coming soon</VirraText>
          </View>
          <SymbolView name="chevron.right" size={16} tintColor={colors.pulse} />
        </Pressable>

        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>ACCOUNT</SectionLabel>
          <Row label="EMAIL" value={session?.user.email ?? '—'} />
        </VirraCard>

        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>SUBSCRIPTION</SectionLabel>
          <Row
            label="STATUS"
            value={subLabel[status] ?? status}
            onPress={() => router.push('/(app)/subscription')}
          />
        </VirraCard>

        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>BODY METRICS</SectionLabel>
          {/* Outside the track-weight gate on purpose: sex picks the resting
              metabolic rate equation whether or not weight is synced, and a
              mis-tap during onboarding has to be fixable without turning
              weight tracking on to reach it. */}
          <Row
            label="SEX"
            value={sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : 'Not set'}
            onPress={() => setSexModalVisible(true)}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <VirraText variant="body" size={15} color={colors.breath}>Track weight</VirraText>
              <VirraText variant="body" size={12} color={colors.muted} style={{ marginTop: 2 }}>
                {weightSyncing
                  ? 'Syncing from Apple Health…'
                  : trackWeight
                    ? 'Synced from Apple Health'
                    : 'Off. No weight data syncs or displays'}
              </VirraText>
            </View>
            <Switch
              value={trackWeight}
              onValueChange={handleToggleWeight}
              disabled={weightSyncing}
              trackColor={{ true: colors.pulse, false: colors.border }}
              thumbColor={colors.breath}
            />
          </View>
          {weightSyncNote && (
            <VirraText variant="body" size={12} color={colors.muted} style={{ marginTop: spacing.xs }}>
              {weightSyncNote}
            </VirraText>
          )}
          {trackWeight && (
            <View style={{ marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Row
                label="HEIGHT"
                value={heightCm != null ? `${heightCm} cm` : 'Not set'}
                onPress={openHeightModal}
              />
              <Row
                label="DATE OF BIRTH"
                value={dateOfBirth
                  ? new Date(dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Not set'}
                onPress={openDobModal}
              />
              <VirraText variant="body" size={12} color={colors.muted} style={{ marginTop: spacing.xs }}>
                Used with your weight to personalise your nutrition targets. Without these we fall back to standard targets.
              </VirraText>
            </View>
          )}
          {trackWeight && weightDiag && (
            <View style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.2 }}>
                LAST APPLE HEALTH SYNC
              </VirraText>
              <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.xs }}>
                {`when:    ${new Date(weightDiag.ranAt).toLocaleString('en-GB')}`}
              </VirraText>
              <VirraText variant="mono" size={10} color={colors.muted}>
                {`bridge:  ${weightDiag.bridgeReady ? 'ready' : 'unavailable'}`}
              </VirraText>
              <VirraText variant="mono" size={10} color={colors.muted}>
                {`window:  ${weightDiag.startDate ? new Date(weightDiag.startDate).toLocaleDateString('en-GB') : '—'} → now`}
              </VirraText>
              <VirraText variant="mono" size={10} color={colors.muted}>
                {`samples: ${weightDiag.samples}`}
              </VirraText>
              <VirraText variant="mono" size={10} color={colors.muted}>
                {`stored:  ${weightDiag.imported}`}
              </VirraText>
              {weightDiag.error && (
                <VirraText variant="mono" size={10} color={colors.dawn} style={{ marginTop: spacing.xs }}>
                  {`error:   ${weightDiag.error}`}
                </VirraText>
              )}
            </View>
          )}
        </VirraCard>

        {/* Nothing here applies when sex is male, and the phase-null path is
            already a first-class case (it is what non-tracking users get), so
            hiding the card changes presentation only. */}
        {sex !== 'male' && (
        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>CYCLE</SectionLabel>
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
        )}

        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>INJURY HISTORY</SectionLabel>
          <Row
            label="HOW YOUR BODY HANDLES IT"
            value={injuryLevel ? INJURY_LABEL[injuryLevel] : 'Not set'}
            onPress={() => setInjuryModalVisible(true)}
          />
        </VirraCard>

        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>TRAINING</SectionLabel>
          <Row
            label="DAILY STEPS TARGET"
            value={stepsTarget.toLocaleString()}
            onPress={() => { setStepsInput(String(stepsTarget)); setStepsError(''); setStepsModalVisible(true); }}
          />
          <Row
            label="BREAKS"
            value={breakSummary}
            onPress={() => router.push('/(app)/breaks' as any)}
          />
          <View style={styles.prefRow}>
            <VirraText variant="mono" size={11} color={colors.muted} style={styles.prefLabel}>WORKOUT LOCATION</VirraText>
            <View style={styles.prefSegments}>
              {([
                { value: 'gym_full',        label: 'Gym'       },
                { value: 'home_dumbbells',  label: 'Dumbbells' },
                { value: 'home_bodyweight', label: 'Bodyweight'},
              ] as const).map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.prefSeg, workoutPreference === opt.value && styles.prefSegActive]}
                  onPress={() => session && saveProfile(session.user.id, { workoutPreference: opt.value })}
                  accessibilityRole="button"
                >
                  <VirraText variant="mono" size={9} color={workoutPreference === opt.value ? colors.mile : colors.muted} style={{ letterSpacing: 0.5 }}>
                    {opt.label.toUpperCase()}
                  </VirraText>
                </Pressable>
              ))}
            </View>
          </View>
        </VirraCard>

        <VirraCard style={styles.card}>
          <SectionLabel style={styles.cardLabel}>HELP &amp; LEGAL</SectionLabel>
          <Row
            label="HEALTH &amp; MEDICAL"
            value="Educational use only · tap to read"
            onPress={() => setMedicalModalVisible(true)}
          />
          <Row
            label="SUPPORT"
            value="hello@virra.app"
            onPress={() => openExternal('mailto:hello@virra.app?subject=Virra%20Support')}
          />
          <Row
            label="PRIVACY POLICY"
            value="virra.app/privacy"
            onPress={() => openExternal('https://virra.app/privacy')}
          />
          <Row
            label="TERMS OF SERVICE"
            value="virra.app/terms"
            onPress={() => openExternal('https://virra.app/terms')}
          />
          <Row
            label="CREDITS"
            value="Data &amp; libraries we use"
            onPress={() => setCreditsModalVisible(true)}
          />
        </VirraCard>

        <Pressable
          style={styles.referCard}
          onPress={() => Share.share({
            message: `I've been training smarter with Virra, the app that adjusts your training and nutrition to your cycle. Try it free: https://virra.app`,
          })}
          accessibilityRole="button"
          accessibilityLabel="Refer a friend"
        >
          <SymbolView name="person.2.fill" size={20} tintColor={colors.pulse} />
          <View style={{ flex: 1 }}>
            <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1 }}>REFER A FRIEND</VirraText>
            <VirraText variant="body" size={12} color={colors.muted} style={{ marginTop: 2 }}>Share Virra with someone who runs</VirraText>
          </View>
          <SymbolView name="square.and.arrow.up" size={16} tintColor={colors.pulse} />
        </Pressable>

        {/* Only the accounts that actually exist. Instagram is the one linked
            from the website footer; inventing handles for the others would put
            dead links in the app. */}
        <Pressable
          style={styles.socialRow}
          onPress={() => openExternal('https://instagram.com/virrarun')}
          accessibilityRole="link"
          accessibilityLabel="Virra on Instagram"
        >
          <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
            FOLLOW @VIRRARUN
          </VirraText>
        </Pressable>

        <VirraButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signout}
        />

        <Pressable
          onPress={openDeleteModal}
          style={{ marginTop: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm }}
        >
          <VirraText variant="mono" size={10} color={colors.heat} style={{ letterSpacing: 1.5 }}>
            DELETE ACCOUNT
          </VirraText>
        </Pressable>

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

      <WeightExplainerModal
        visible={showExplainer}
        mode={(cycleProfile === 'natural' || cycleProfile === 'irregular') ? 'cycle' : 'steady'}
        onDismiss={handleDismissExplainer}
      />

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

      {/* Health & medical disclaimer modal */}
      <VirraModal
        visible={medicalModalVisible}
        onClose={() => setMedicalModalVisible(false)}
        title="Health & medical"
      >
        <VirraText variant="body" size={14} color={colors.breath}>
          Virra is an educational and training-guidance product. It is not a medical service, does not provide a diagnosis, and is not a substitute for professional medical advice.
        </VirraText>
        <VirraText variant="body" size={13} color={colors.muted} style={{ marginTop: spacing.sm }}>
          Cycle phase, pace, and fuelling recommendations are generated from the data you and Apple Health provide and from general physiology research. Consult a qualified healthcare professional before making decisions about exercise, nutrition, or your cycle, especially if pregnant, post-partum, breastfeeding, on hormonal contraception, perimenopausal, menopausal, or managing any medical condition.
        </VirraText>
        <VirraText variant="body" size={13} color={colors.muted} style={{ marginTop: spacing.sm }}>
          If you experience pain, dizziness, unusual symptoms, or anything that concerns you, stop exercising and seek medical advice.
        </VirraText>
        <VirraButton label="Got it" variant="ghost" onPress={() => setMedicalModalVisible(false)} style={{ marginTop: spacing.md }} />
      </VirraModal>

      {/* Credits modal */}
      <VirraModal
        visible={creditsModalVisible}
        onClose={() => setCreditsModalVisible(false)}
        title="Credits"
      >
        <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>
          FOOD DATABASE
        </VirraText>
        <VirraText variant="body" size={13} color={colors.breath} style={{ marginTop: 2 }}>
          Food and barcode data is provided by Open Food Facts, a collaborative open database, under the Open Database License.
        </VirraText>
        <Pressable onPress={() => openExternal('https://world.openfoodfacts.org')} style={{ marginTop: spacing.xs }}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={{ letterSpacing: 1.5 }}>
            OPENFOODFACTS.ORG →
          </VirraText>
        </Pressable>

        <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5, marginTop: spacing.md }}>
          TYPEFACES
        </VirraText>
        <VirraText variant="body" size={13} color={colors.breath} style={{ marginTop: 2 }}>
          Big Shoulders Display, Fraunces, Inter, and Space Mono, distributed by Google Fonts under the SIL Open Font License.
        </VirraText>

        <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5, marginTop: spacing.md }}>
          BUILT WITH
        </VirraText>
        <VirraText variant="body" size={13} color={colors.breath} style={{ marginTop: 2 }}>
          React Native, Expo, Supabase, RevenueCat.
        </VirraText>

        <VirraButton label="Close" variant="ghost" onPress={() => setCreditsModalVisible(false)} style={{ marginTop: spacing.md }} />
      </VirraModal>

      {/* Steps target modal */}
      <VirraModal
        visible={stepsModalVisible}
        onClose={() => { setStepsModalVisible(false); setStepsError(''); }}
        title="Daily Steps Target"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          Set your daily step goal (1,000–30,000). Default is 8,000.
        </VirraText>
        <TextInput
          value={stepsInput}
          onChangeText={setStepsInput}
          keyboardType="number-pad"
          maxLength={5}
          style={styles.modalInput}
          placeholderTextColor="rgba(244,237,224,0.3)"
        />
        {stepsError ? (
          <VirraText variant="mono" size={10} color={colors.heat} style={{ letterSpacing: 1 }}>
            {stepsError.toUpperCase()}
          </VirraText>
        ) : null}
        <VirraButton label="SAVE" onPress={handleStepsTargetSave} loading={saving} />
      </VirraModal>

      <VirraModal
        visible={sexModalVisible}
        onClose={() => setSexModalVisible(false)}
        title="Sex"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          Used to pick the equation behind your calorie targets, alongside your
          age, height and weight.
        </VirraText>
        {(['female', 'male'] as Sex[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => handleSexSave(option)}
            style={[styles.sexOption, sex === option && styles.sexOptionActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: sex === option }}
          >
            <VirraText variant="mono" size={13} color={sex === option ? colors.mile : colors.breath}>
              {option.toUpperCase()}
            </VirraText>
          </Pressable>
        ))}
        {sex === 'male' && (
          <VirraText variant="body" size={12} color={colors.muted} style={{ lineHeight: 18 }}>
            Virra&apos;s training plans are designed around female physiology. The
            progressions and principles are universal, so they still work, and
            your fuelling targets are calculated for you either way.
          </VirraText>
        )}
      </VirraModal>

      <VirraModal
        visible={injuryModalVisible}
        onClose={() => setInjuryModalVisible(false)}
        title="Injury history"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          This shapes how quickly we build your training. It is not medical
          advice, and if something hurts, see someone qualified rather than us.
        </VirraText>
        {INJURY_LEVELS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => handleInjurySave(opt.value)}
            style={[styles.sexOption, injuryLevel === opt.value && styles.sexOptionActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: injuryLevel === opt.value }}
          >
            <VirraText variant="mono" size={13} color={injuryLevel === opt.value ? colors.mile : colors.breath}>
              {opt.label.toUpperCase()}
            </VirraText>
          </Pressable>
        ))}
      </VirraModal>

      <VirraModal
        visible={heightModalVisible}
        onClose={() => { setHeightModalVisible(false); setHeightError(''); }}
        title="Height"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          Set your height in centimetres (140–210).
        </VirraText>
        <TextInput
          value={heightInput}
          onChangeText={setHeightInput}
          keyboardType="number-pad"
          maxLength={3}
          style={styles.modalInput}
          placeholder="cm"
          placeholderTextColor="rgba(244,237,224,0.3)"
        />
        {heightError ? (
          <VirraText variant="mono" size={10} color={colors.heat} style={{ letterSpacing: 1 }}>
            {heightError.toUpperCase()}
          </VirraText>
        ) : null}
        <VirraButton label="SAVE" onPress={handleHeightSave} loading={saving} />
      </VirraModal>

      <VirraModal
        visible={dobModalVisible}
        onClose={() => setDobModalVisible(false)}
        title="Date of birth"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)">
          Your age refines your calorie targets.
        </VirraText>
        <View style={{ alignItems: 'center', marginVertical: spacing.sm }}>
          <DateTimePicker
            value={dobDraft ?? new Date(new Date().getFullYear() - 30, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            themeVariant="dark"
            onChange={(_event, selected) => { if (selected) setDobDraft(selected); }}
          />
        </View>
        <VirraButton label="SAVE" onPress={handleDobSave} loading={saving} disabled={!dobDraft} />
      </VirraModal>

      {/* Edit name modal */}
      <VirraModal
        visible={nameModalVisible}
        onClose={() => setNameModalVisible(false)}
        title="Your name"
      >
        <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
          FIRST NAME
        </VirraText>
        <TextInput
          value={firstNameInput}
          onChangeText={(t) => { setFirstNameInput(t); setNameError(''); }}
          autoCapitalize="words"
          autoComplete="given-name"
          style={styles.modalInput}
          placeholder="First"
          placeholderTextColor="rgba(244,237,224,0.3)"
        />
        <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5, marginTop: spacing.sm }}>
          LAST NAME
        </VirraText>
        <TextInput
          value={lastNameInput}
          onChangeText={(t) => { setLastNameInput(t); setNameError(''); }}
          autoCapitalize="words"
          autoComplete="family-name"
          style={styles.modalInput}
          placeholder="Last"
          placeholderTextColor="rgba(244,237,224,0.3)"
          returnKeyType="done"
          onSubmitEditing={handleNameSave}
        />
        {nameError ? (
          <VirraText variant="mono" size={10} color={colors.heat} style={{ letterSpacing: 1, marginTop: spacing.xs }}>
            {nameError.toUpperCase()}
          </VirraText>
        ) : null}
        <VirraButton label="SAVE" onPress={handleNameSave} loading={saving} style={{ marginTop: spacing.md }} />
      </VirraModal>

      {/* Delete account: two deliberate steps, because it cannot be undone */}
      <VirraModal
        visible={deleteModalVisible}
        onClose={closeDeleteModal}
        title="Delete account"
      >
        {deleteStage === 'explain' ? (
          <>
            <VirraText variant="body" size={14} color={colors.breath}>
              This permanently erases your Virra account: your profile, training plan, cycle data, activities, nutrition logs, and subscription record. It cannot be undone, and we cannot recover it for you afterwards.
            </VirraText>
            <VirraText variant="body" size={13} color={colors.breath} style={{ marginTop: spacing.sm }}>
              Anything Virra wrote to Apple Health stays in Apple Health. Your workouts and weight readings remain yours to keep, and you can delete them yourself in the Health app at any time.
            </VirraText>
            <VirraText variant="body" size={13} color={colors.muted} style={{ marginTop: spacing.sm }}>
              If you have an active subscription, cancel it in the App Store first. Deleting your account here does not cancel Apple billing.
            </VirraText>
            <VirraButton
              label="Continue"
              variant="primary"
              onPress={() => setDeleteStage('confirm')}
              style={{ marginTop: spacing.md, backgroundColor: colors.heat }}
            />
            <VirraButton
              label="Keep my account"
              variant="ghost"
              onPress={closeDeleteModal}
              style={{ marginTop: spacing.xs }}
            />
          </>
        ) : (
          <>
            <VirraText variant="body" size={14} color={colors.breath}>
              Last check. This is permanent.
            </VirraText>
            <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5, marginTop: spacing.md }}>
              TYPE &ldquo;DELETE&rdquo; TO CONFIRM
            </VirraText>
            <TextInput
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.modalInput}
              placeholder="DELETE"
              placeholderTextColor="rgba(244,237,224,0.3)"
            />
            <VirraButton
              label="Delete my account"
              variant="primary"
              onPress={handleDeleteAccount}
              loading={deleting}
              disabled={deleteConfirm.trim().toUpperCase() !== 'DELETE' || deleting}
              style={{ marginTop: spacing.md, backgroundColor: colors.heat }}
            />
            <VirraButton
              label="Back"
              variant="ghost"
              onPress={() => { setDeleteStage('explain'); setDeleteConfirm(''); }}
              disabled={deleting}
              style={{ marginTop: spacing.xs }}
            />
          </>
        )}
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
  sexOption:       { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.control, backgroundColor: colors.mist },
  sexOptionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  socialRow:    { alignItems: 'center', paddingVertical: spacing.md },
  signout:           { marginTop: spacing.md },
  referCard:         { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.pulse}44`, backgroundColor: 'rgba(212,255,38,0.05)', marginTop: spacing.sm },
  prefRow:           { paddingTop: spacing.xs },
  prefLabel:         { letterSpacing: 1.5, marginBottom: spacing.xs },
  prefSegments:      { flexDirection: 'row', gap: spacing.xs },
  prefSeg:           { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.control, backgroundColor: colors.mist },
  prefSegActive:     { backgroundColor: colors.pulse, borderColor: colors.pulse },
  identityRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarWrap:        { position: 'relative' },
  avatarImg:         { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: { backgroundColor: colors.mile, borderWidth: 1, borderColor: colors.control, alignItems: 'center', justifyContent: 'center' },
  cameraBadge:       { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.pulse, alignItems: 'center', justifyContent: 'center' },
  identityNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  identityText:      { flex: 1 },
  modalInput:        { backgroundColor: colors.mile, borderRadius: radius.md, borderWidth: 1, borderColor: colors.control, color: colors.breath, fontFamily: 'SpaceMono_400Regular', fontSize: 24, textAlign: 'center', paddingVertical: spacing.md },
});
