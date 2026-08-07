import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, SafeAreaView, Alert, AppState } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

// Supabase reports an unconfirmed address differently across versions, so match
// on the stable error code first and fall back to the message.
function isUnconfirmedEmail(error: AuthError): boolean {
  return error.code === 'email_not_confirmed'
    || /email not confirmed/i.test(error.message);
}

export default function SignUpScreen() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  // When Supabase has email confirmation on, signUp() returns no session. Without
  // one the onboarding profile save is impossible, so we hold the user on this
  // screen rather than walking them through onboarding that cannot save.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const [confirmError,  setConfirmError]  = useState<string | null>(null);

  // Attempt to pick up the session created by confirming the email. Silent runs
  // (app returning to the foreground) leave the UI alone when it hasn't happened
  // yet; explicit runs (button press) always report back.
  async function checkConfirmed(silent: boolean) {
    if (!email || !password) return;
    if (!silent) {
      setLoading(true);
      setConfirmError(null);
      setConfirmNotice(null);
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!silent) setLoading(false);

    if (error) {
      if (!silent) {
        setConfirmError(
          isUnconfirmedEmail(error)
            ? 'That address is not confirmed yet. Tap the link in the email, then try again.'
            : error.message,
        );
      }
      return;
    }
    if (data.session) router.replace('/(onboarding)/welcome');
  }

  // Coming back from Mail or Safari is the moment confirmation usually lands, so
  // retry then and drop the user straight into onboarding if it worked.
  useEffect(() => {
    if (!awaitingConfirmation) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkConfirmed(true);
    });
    return () => sub.remove();
  }, [awaitingConfirmation, email, password]);

  async function handleAppleSignUp() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) Alert.alert('Sign up failed', error.message);
        else router.replace('/(onboarding)/welcome');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        const msg = e.message || `Error ${e.code ?? 'unknown'}`;
        Alert.alert('Sign up failed', msg);
      }
    }
  }

  async function handleEmailSignUp() {
    if (!email || !password) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }
    // A session means the account is usable immediately (confirmation off).
    // No session means Supabase has sent a confirmation email and is waiting.
    if (data.session) {
      router.replace('/(onboarding)/welcome');
    } else {
      setAwaitingConfirmation(true);
    }
  }

  async function handleResend() {
    setLoading(true);
    setConfirmError(null);
    setConfirmNotice(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setLoading(false);
    if (error) setConfirmError(error.message);
    else setConfirmNotice('Sent. It can take a minute to arrive.');
  }

  function useDifferentEmail() {
    setAwaitingConfirmation(false);
    setConfirmError(null);
    setConfirmNotice(null);
    setPassword('');
  }

  if (awaitingConfirmation) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <VirraText variant="display" size={40} color={colors.pulse} style={styles.title}>
            Check your email
          </VirraText>

          <VirraText variant="body" color={colors.breath} style={styles.blurb}>
            We have sent a confirmation link to {email}. Tap it, then come back here and we
            will pick up where you left off.
          </VirraText>

          {confirmError && (
            <VirraText variant="body" size={13} color={colors.heat} style={styles.notice}>
              {confirmError}
            </VirraText>
          )}
          {confirmNotice && (
            <VirraText variant="body" size={13} color={colors.slate} style={styles.notice}>
              {confirmNotice}
            </VirraText>
          )}

          <VirraButton
            label="I've confirmed my email"
            onPress={() => checkConfirmed(false)}
            loading={loading}
            style={styles.btn}
          />
          <VirraButton
            label="Resend email"
            variant="ghost"
            onPress={handleResend}
            style={styles.link}
          />
          <VirraButton
            label="Use a different email"
            variant="ghost"
            onPress={useDifferentEmail}
            style={styles.link}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <VirraText variant="display" size={40} color={colors.pulse} style={styles.title}>
          Create account
        </VirraText>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.full}
          style={styles.appleBtn}
          onPress={handleAppleSignUp}
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
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            <VirraButton
              label="Create account"
              onPress={handleEmailSignUp}
              loading={loading}
              style={styles.btn}
            />
          </>
        ) : (
          <VirraButton
            label="Sign up with email instead"
            variant="ghost"
            onPress={() => setShowEmail(true)}
            style={styles.emailToggle}
          />
        )}

        <VirraButton
          label="Already have an account? Sign in"
          variant="ghost"
          onPress={() => router.replace('/(auth)/sign-in')}
          style={styles.link}
        />
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
  blurb:       { lineHeight: 22 },
  notice:      { lineHeight: 19, marginTop: spacing.xs },
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
  btn:  { marginTop: spacing.md },
  link: { marginTop: spacing.xs },
});
