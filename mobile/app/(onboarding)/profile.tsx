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
  useFocusEffect(React.useCallback(() => { setStep(2); }, [setStep]));

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
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
            accessibilityLabel="First name"
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
            accessibilityLabel="Last name"
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
