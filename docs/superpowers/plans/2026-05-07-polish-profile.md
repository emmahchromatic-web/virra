# Profile Polish — Name, Photo, Onboarding Step, Centred Modals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first/last name + profile photo to onboarding and profile screen; replace all native Alert popups in Profile with a frosted-glass centred modal.

**Architecture:** A new `VirraModal` component (BlurView backdrop + centred card) becomes the single styled popup across the app. A `useProfileStore` Zustand store holds name + avatar URL, loaded from Supabase on session start. The profile onboarding screen is inserted as step 2, shifting all subsequent step numbers by +1. Avatar images upload to a Supabase Storage `avatars` bucket; upload happens at the end of onboarding (diet.tsx completion) alongside the rest of the profile save.

**Tech Stack:** expo-image-picker, expo-blur, Supabase Storage, Zustand, React Native Modal

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260507_profile_name_avatar.sql` | Add columns + storage bucket + RLS |
| Create | `src/store/profile.ts` | Zustand store: firstName, lastName, avatarUrl |
| Create | `src/components/ui/VirraModal.tsx` | Frosted-glass centred modal |
| Create | `app/(onboarding)/profile.tsx` | Name + photo onboarding step (step 2) |
| Modify | `src/context/OnboardingContext.tsx` | Add firstName, lastName, localAvatarUri |
| Modify | `app/(onboarding)/welcome.tsx` | Route to /profile instead of /permissions |
| Modify | `app/(onboarding)/permissions.tsx` | setStep(3) |
| Modify | `app/(onboarding)/fitness.tsx` | setStep(4) |
| Modify | `app/(onboarding)/goal.tsx` | setStep(5) |
| Modify | `app/(onboarding)/cycle.tsx` | setStep(6) |
| Modify | `app/(onboarding)/diet.tsx` | setStep(7) + save name/avatar to Supabase |
| Modify | `app/(onboarding)/_layout.tsx` | totalSteps 7 → 8 |
| Modify | `app/(app)/(tabs)/profile.tsx` | Show name/avatar, replace Alert.prompt / Alert.alert with VirraModal |

---

### Task 1: DB migration — add name columns, create avatars storage bucket

**Files:**
- Create: `supabase/migrations/20260507_profile_name_avatar.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add name + avatar columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create avatars storage bucket (public so URLs work without auth headers)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload into their own folder
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `profile_name_avatar` and the SQL above.

- [ ] **Step 3: Verify**

Run `mcp__supabase__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND column_name IN ('first_name', 'last_name', 'avatar_url');
```
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add first_name, last_name, avatar_url to user_profiles + avatars bucket"
```

---

### Task 2: Install packages

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run from `mobile/`:
```bash
npx expo install expo-image-picker expo-blur
```

- [ ] **Step 2: Verify**

```bash
cat package.json | grep -E "expo-image-picker|expo-blur"
```
Expected: both appear in dependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-image-picker and expo-blur"
```

---

### Task 3: Profile Zustand store

**Files:**
- Create: `src/store/profile.ts`

- [ ] **Step 1: Write the store**

```typescript
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface ProfileState {
  firstName:  string;
  lastName:   string;
  avatarUrl:  string | null;
  isLoaded:   boolean;
  load:       (userId: string) => Promise<void>;
  save:       (userId: string, patch: { firstName?: string; lastName?: string; avatarUrl?: string }) => Promise<void>;
  setLocal:   (patch: { firstName?: string; lastName?: string; avatarUrl?: string | null }) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  firstName: '',
  lastName:  '',
  avatarUrl: null,
  isLoaded:  false,

  load: async (userId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      set({
        firstName: data.first_name ?? '',
        lastName:  data.last_name  ?? '',
        avatarUrl: data.avatar_url ?? null,
        isLoaded:  true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  save: async (userId, patch) => {
    const update: Record<string, string | null> = {};
    if (patch.firstName !== undefined) update.first_name = patch.firstName;
    if (patch.lastName  !== undefined) update.last_name  = patch.lastName;
    if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;

    await supabase
      .from('user_profiles')
      .update(update)
      .eq('id', userId);

    set({
      firstName: patch.firstName ?? get().firstName,
      lastName:  patch.lastName  ?? get().lastName,
      avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : get().avatarUrl,
    });
  },

  setLocal: (patch) => set((s) => ({
    firstName: patch.firstName ?? s.firstName,
    lastName:  patch.lastName  ?? s.lastName,
    avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : s.avatarUrl,
  })),
}));
```

- [ ] **Step 2: Wire up in app/(app)/_layout.tsx**

In `AppLayout`, after the existing `loadFromSupabase` effect, add a call to load the profile store. Import `useProfileStore` and add:

```typescript
import { useProfileStore } from '@/store/profile';

// inside AppLayout:
const { load: loadProfile } = useProfileStore();

useEffect(() => {
  if (session?.user.id) loadProfile(session.user.id);
}, [session?.user.id]);
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "jsr:\|Deno"
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/profile.ts app/(app)/_layout.tsx
git commit -m "feat: add profile Zustand store with name + avatar"
```

---

### Task 4: VirraModal component

**Files:**
- Create: `src/components/ui/VirraModal.tsx`

- [ ] **Step 1: Write the component**

```typescript
import React from 'react';
import { View, Modal, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface Props {
  visible:     boolean;
  onClose:     () => void;
  title?:      string;
  children:    React.ReactNode;
  style?:      ViewStyle;
}

export function VirraModal({ visible, onClose, title, children, style }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BlurView intensity={50} tint="dark" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, style]}>
          {title && (
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.title}>
              {title.toUpperCase()}
            </VirraText>
          )}
          {children}
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width:           '100%',
    backgroundColor: colors.mist,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.md,
    zIndex:          1,
  },
  title: {
    letterSpacing: 1.5,
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "jsr:\|Deno"
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/VirraModal.tsx
git commit -m "feat: add VirraModal — frosted-glass centred modal component"
```

---

### Task 5: Profile onboarding screen (name + photo, step 2)

**Files:**
- Create: `app/(onboarding)/profile.tsx`
- Modify: `src/context/OnboardingContext.tsx`

- [ ] **Step 1: Update OnboardingContext to hold name + avatar URI**

In `src/context/OnboardingContext.tsx`, add `firstName`, `lastName`, `localAvatarUri` to `OnboardingData` and `defaultData`:

```typescript
// Add to interface OnboardingData:
  firstName:      string;
  lastName:       string;
  localAvatarUri: string | null;

// Add to defaultData:
  firstName:      '',
  lastName:       '',
  localAvatarUri: null,
```

- [ ] **Step 2: Write the profile onboarding screen**

```typescript
import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Image, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';

export default function ProfileOnboardingScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(2); }, []));

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  function handleContinue() {
    setData({ firstName: firstName.trim(), lastName: lastName.trim(), localAvatarUri: avatarUri });
    router.push('/(onboarding)/permissions');
  }

  const canContinue = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Who are we coaching?
      </VirraText>
      <VirraText variant="body" size={14} color="rgba(244,237,224,0.5)" style={styles.sub}>
        Your name and photo are only visible to you.
      </VirraText>

      {/* Avatar picker */}
      <Pressable onPress={pickAvatar} style={styles.avatarWrap} accessibilityRole="button" accessibilityLabel="Choose profile photo">
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <SymbolView name="person.crop.circle" size={40} tintColor={colors.muted} />
          </View>
        )}
        <View style={styles.avatarBadge}>
          <SymbolView name="plus" size={12} tintColor={colors.mile} />
        </View>
      </Pressable>
      <VirraText variant="mono" size={9} color={colors.muted} style={styles.avatarHint}>
        TAP TO ADD PHOTO · OPTIONAL
      </VirraText>

      {/* Name inputs */}
      <View style={styles.inputs}>
        <View style={styles.inputWrap}>
          <VirraText variant="mono" size={9} color={colors.pulse} style={styles.inputLabel}>FIRST NAME</VirraText>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Your first name"
            placeholderTextColor="rgba(244,237,224,0.25)"
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>
        <View style={styles.inputWrap}>
          <VirraText variant="mono" size={9} color={colors.pulse} style={styles.inputLabel}>LAST NAME</VirraText>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Your last name"
            placeholderTextColor="rgba(244,237,224,0.25)"
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>
      </View>

      <VirraButton label="CONTINUE" onPress={handleContinue} disabled={!canContinue} style={styles.cta} />
    </ScrollView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  scroll:            { flex: 1 },
  container:         { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, alignItems: 'center' },
  title:             { lineHeight: 34, alignSelf: 'flex-start' },
  sub:               { lineHeight: 20, alignSelf: 'flex-start', marginTop: -spacing.sm },
  avatarWrap:        { width: AVATAR_SIZE, height: AVATAR_SIZE, marginTop: spacing.md, position: 'relative' },
  avatar:            { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 2, borderColor: colors.pulse },
  avatarPlaceholder: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarBadge:       { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.pulse, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.mile },
  avatarHint:        { letterSpacing: 1.5, marginTop: -spacing.sm },
  inputs:            { width: '100%', gap: spacing.md },
  inputWrap:         { gap: spacing.xs },
  inputLabel:        { letterSpacing: 2 },
  input:             { backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, color: colors.breath, fontFamily: 'Inter_400Regular', fontSize: 16, borderWidth: 1, borderColor: colors.border },
  cta:               { width: '100%', marginTop: spacing.sm },
});
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "jsr:\|Deno"
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/(onboarding)/profile.tsx src/context/OnboardingContext.tsx
git commit -m "feat: add profile name + photo onboarding screen (step 2)"
```

---

### Task 6: Update onboarding routing and step numbers

**Files:**
- Modify: `app/(onboarding)/welcome.tsx`
- Modify: `app/(onboarding)/permissions.tsx`
- Modify: `app/(onboarding)/fitness.tsx`
- Modify: `app/(onboarding)/goal.tsx`
- Modify: `app/(onboarding)/cycle.tsx`
- Modify: `app/(onboarding)/diet.tsx`
- Modify: `app/(onboarding)/_layout.tsx`

- [ ] **Step 1: welcome.tsx — route to profile instead of permissions**

Change:
```typescript
router.push('/(onboarding)/permissions')
```
To:
```typescript
router.push('/(onboarding)/profile')
```

- [ ] **Step 2: permissions.tsx — setStep(3)**

Change `setStep(2)` → `setStep(3)`.

- [ ] **Step 3: fitness.tsx — setStep(4)**

Change `setStep(3)` → `setStep(4)`.

- [ ] **Step 4: goal.tsx — setStep(5)**

Change `setStep(4)` → `setStep(5)`.

- [ ] **Step 5: cycle.tsx — setStep(6)**

Change `setStep(5)` → `setStep(6)`.

- [ ] **Step 6: diet.tsx — setStep(7) + save name/avatar**

Change `setStep(6)` → `setStep(7)`.

In the save function (wherever `onboarding_complete: true` is set), add name + avatar upload. Find the `handleComplete` or equivalent function and add after the existing Supabase profile upsert:

```typescript
// upload avatar if one was selected during onboarding
if (data.localAvatarUri) {
  const ext      = data.localAvatarUri.split('.').pop() ?? 'jpg';
  const path     = `${session.user.id}/avatar.${ext}`;
  const response = await fetch(data.localAvatarUri);
  const blob     = await response.blob();
  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: `image/${ext}` });
  if (!uploadErr) {
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);
    await supabase
      .from('user_profiles')
      .update({ first_name: data.firstName, last_name: data.lastName, avatar_url: publicUrl })
      .eq('id', session.user.id);
  } else {
    // Save name even if avatar upload fails
    await supabase
      .from('user_profiles')
      .update({ first_name: data.firstName, last_name: data.lastName })
      .eq('id', session.user.id);
  }
} else if (data.firstName) {
  await supabase
    .from('user_profiles')
    .update({ first_name: data.firstName, last_name: data.lastName })
    .eq('id', session.user.id);
}
```

You need to read `diet.tsx` in full to find the exact save function and insert in the right place. Import `useOnboarding` (already imported) and access `data` from it.

- [ ] **Step 7: _layout.tsx — totalSteps 8**

Change `totalSteps={7}` → `totalSteps={8}`.

- [ ] **Step 8: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "jsr:\|Deno"
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add app/(onboarding)/
git commit -m "feat: insert profile step into onboarding flow, shift step numbers"
```

---

### Task 7: Profile screen — show name/avatar, replace Alerts with VirraModal

**Files:**
- Modify: `app/(app)/(tabs)/profile.tsx`

Currently, two places use native Alert popups that need replacing:
1. `showCycleLengthPicker()` — uses `Alert.prompt` (iOS-only) to enter a number
2. The "MANAGE" subscription row uses `Alert.alert`

- [ ] **Step 1: Read the current profile.tsx in full**

Read `app/(app)/(tabs)/profile.tsx` before editing.

- [ ] **Step 2: Add state for modal visibility**

Add these states to `ProfileScreen`:
```typescript
const { firstName, lastName, avatarUrl, load: loadProfile, save: saveProfile } = useProfileStore();

const [cycleLengthModalVisible,  setCycleLengthModalVisible]  = useState(false);
const [cycleLengthInput,         setCycleLengthInput]          = useState('');
const [subscriptionModalVisible, setSubscriptionModalVisible]  = useState(false);
```

Also add a `useEffect` to load the profile:
```typescript
useEffect(() => {
  if (session?.user.id) loadProfile(session.user.id);
}, [session?.user.id]);
```

- [ ] **Step 3: Add a profile header showing name + avatar**

Replace the existing `ACCOUNT` card (which only shows email) with a header card showing avatar + name:

```typescript
<VirraCard style={styles.card}>
  <View style={styles.profileHeader}>
    {avatarUrl ? (
      <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} />
    ) : (
      <View style={styles.profileAvatarPlaceholder}>
        <SymbolView name="person.crop.circle" size={28} tintColor={colors.muted} />
      </View>
    )}
    <View style={{ flex: 1 }}>
      {(firstName || lastName) ? (
        <VirraText variant="bodyMedium" size={18} color={colors.breath}>
          {[firstName, lastName].filter(Boolean).join(' ')}
        </VirraText>
      ) : (
        <VirraText variant="body" size={15} color={colors.muted}>No name set</VirraText>
      )}
      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1, marginTop: 2 }}>
        {session?.user.email ?? '—'}
      </VirraText>
    </View>
  </View>
</VirraCard>
```

Add to styles:
```typescript
profileHeader:           { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
profileAvatar:           { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.pulse },
profileAvatarPlaceholder:{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
```

Add `Image` to the React Native import. Add `useProfileStore` import. Remove the old `Row label="EMAIL"` row (email is now shown in the header).

- [ ] **Step 4: Replace showCycleLengthPicker with VirraModal**

Remove the `showCycleLengthPicker` function.

Change the cycle length Row's `onPress`:
```typescript
onPress={() => {
  setCycleLengthInput(String(cycleLength));
  setCycleLengthModalVisible(true);
}}
```

Add the modal to the JSX (before closing `</SafeAreaView>`):

```typescript
{/* Cycle length modal */}
<VirraModal
  visible={cycleLengthModalVisible}
  onClose={() => setCycleLengthModalVisible(false)}
  title="Cycle Length"
>
  <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)">
    Enter your average cycle length in days (21–40)
  </VirraText>
  <TextInput
    value={cycleLengthInput}
    onChangeText={setCycleLengthInput}
    keyboardType="number-pad"
    maxLength={2}
    style={styles.modalInput}
    placeholder="28"
    placeholderTextColor="rgba(244,237,224,0.25)"
    autoFocus
  />
  <View style={styles.modalButtons}>
    <Pressable
      style={styles.modalCancel}
      onPress={() => setCycleLengthModalVisible(false)}
    >
      <VirraText variant="mono" size={11} color={colors.muted}>CANCEL</VirraText>
    </Pressable>
    <Pressable
      style={styles.modalConfirm}
      onPress={() => {
        const days = parseInt(cycleLengthInput, 10);
        if (!isNaN(days) && days >= 21 && days <= 40) {
          updateCycleLength(days);
          setCycleLengthModalVisible(false);
        }
      }}
    >
      <VirraText variant="mono" size={11} color={colors.mile}>SAVE</VirraText>
    </Pressable>
  </View>
</VirraModal>
```

- [ ] **Step 5: Replace subscription Alert with VirraModal**

Change the MANAGE row's `onPress`:
```typescript
onPress={() => setSubscriptionModalVisible(true)}
```

Add the modal:
```typescript
{/* Subscription modal */}
<VirraModal
  visible={subscriptionModalVisible}
  onClose={() => setSubscriptionModalVisible(false)}
  title="Manage Subscription"
>
  <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={{ lineHeight: 22 }}>
    To manage or cancel your subscription, go to{'\n'}
    <VirraText variant="bodyMedium" color={colors.breath}>Settings → Apple ID → Subscriptions</VirraText>
    {'\n'}on your iPhone.
  </VirraText>
  <Pressable
    style={[styles.modalConfirm, { marginTop: spacing.xs }]}
    onPress={() => setSubscriptionModalVisible(false)}
  >
    <VirraText variant="mono" size={11} color={colors.mile}>GOT IT</VirraText>
  </Pressable>
</VirraModal>
```

- [ ] **Step 6: Add modal styles + imports**

Add to styles:
```typescript
modalInput:   { backgroundColor: colors.mile, borderRadius: radius.md, padding: spacing.md, color: colors.breath, fontFamily: 'SpaceMono_400Regular', fontSize: 20, borderWidth: 1, borderColor: colors.border, textAlign: 'center' },
modalButtons: { flexDirection: 'row', gap: spacing.sm },
modalCancel:  { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
modalConfirm: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.pulse },
```

Add imports: `TextInput`, `Image` from `react-native`; `VirraModal` from `@/components/ui/VirraModal`; `useProfileStore` from `@/store/profile`. Remove `Alert` from imports if no longer used.

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "jsr:\|Deno"
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/(app)/(tabs)/profile.tsx src/store/profile.ts
git commit -m "feat: profile screen — show name/avatar, replace Alert popups with VirraModal"
```
