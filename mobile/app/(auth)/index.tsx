import React from 'react';
import { View, StyleSheet, SafeAreaView, Image } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraButton } from '@/components/ui/VirraButton';

export default function WelcomeScreen() {

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Image
            source={require('../../assets/Splash2.png')}
            style={styles.splash}
            resizeMode="contain"
          />
        </View>

        <View style={styles.actions}>
          <VirraButton
            label="Get started · Free trial"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <VirraButton
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/sign-in')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  hero:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splash:    { width: 300, height: 130 },
  actions:   { paddingBottom: spacing.xl },
});
