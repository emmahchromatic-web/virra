import React, { useState } from 'react';
import { View, TextInput, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { getPostAuthRoute } from '@/lib/permissionsConfig';

async function routeAfterSignIn(userId: string) {
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (!data) {
    router.replace('/(onboarding)/welcome');
    return;
  }
  const route = await getPostAuthRoute();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.replace(route as any);
}

export default function SignInScreen() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  async function handleAppleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) Alert.alert('Apple sign in failed', error.message);
        else if (data.user) await routeAfterSignIn(data.user.id);
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        const msg = e.message || `Error ${e.code ?? 'unknown'}`;
        Alert.alert('Apple sign in failed', msg);
      }
    }
  }

  async function handleEmailSignIn() {
    if (!email || !password) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
    } else if (data.user) {
      await routeAfterSignIn(data.user.id);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <VirraText variant="display" size={40} color={colors.pulse} style={styles.title}>
          Sign in
        </VirraText>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.full}
          style={styles.appleBtn}
          onPress={handleAppleSignIn}
        />

        {showEmail ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
            />
            <VirraButton
              label="Sign in"
              onPress={handleEmailSignIn}
              loading={loading}
              style={styles.btn}
            />
          </>
        ) : (
          <VirraButton
            label="Sign in with email instead"
            variant="ghost"
            onPress={() => setShowEmail(true)}
            style={styles.emailToggle}
          />
        )}

        <VirraButton
          label="Don't have an account? Sign up"
          variant="ghost"
          onPress={() => router.replace('/(auth)/sign-up')}
          style={styles.link}
        />

        {__DEV__ && (
          <VirraButton
            label="[DEV] Skip auth"
            variant="ghost"
            onPress={async () => {
              const { data, error } = await supabase.auth.signInAnonymously();
              if (error) { Alert.alert('DEV bypass failed', error.message); return; }
              if (data.user) {
                // Seed cycle store so the dashboard phase card renders
                useCycleStore.getState().setPeriodStart(
                  new Date(Date.now() - 13 * 24 * 60 * 60 * 1000), // day 14 → ovulatory
                );
                await routeAfterSignIn(data.user.id);
              }
            }}
            style={{ marginTop: spacing.lg, opacity: 0.4 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  container:   { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm },
  title:       { marginBottom: spacing.lg },
  appleBtn:    { height: 52, width: '100%' },
  emailToggle: { marginTop: spacing.xs },
  input: {
    backgroundColor: colors.mist,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.breath,
  },
  btn:  { marginTop: spacing.sm },
  link: { marginTop: spacing.xs },
});
