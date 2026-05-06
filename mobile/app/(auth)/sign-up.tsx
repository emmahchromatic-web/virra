import React, { useState } from 'react';
import { View, TextInput, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

export default function SignUpScreen() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [showEmail, setShowEmail] = useState(false);

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
        else router.replace('/(auth)');
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
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      router.replace('/(auth)');
    }
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
