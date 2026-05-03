import React, { useState } from 'react';
import { View, TextInput, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

export default function SignInScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleEmailSignIn() {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
  }

  async function handleAppleSignIn() {
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
        if (error) Alert.alert('Apple sign in failed', error.message);
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign in failed', e.message);
      }
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

        <VirraText variant="label" color={colors.muted} style={styles.divider}>
          or continue with email
        </VirraText>

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

        <VirraButton
          label="Don't have an account? Sign up"
          variant="ghost"
          onPress={() => router.replace('/(auth)/sign-up')}
          style={styles.link}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm },
  title:     { marginBottom: spacing.lg },
  appleBtn:  { height: 52, width: '100%' },
  divider:   { textAlign: 'center', marginVertical: spacing.sm },
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
