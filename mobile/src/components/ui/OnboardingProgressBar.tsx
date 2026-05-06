import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  currentStep: number;
  totalSteps:  number;
}

export function OnboardingProgressBar({ currentStep, totalSteps }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          testID="progress-pill"
          style={{
            ...styles.pill,
            backgroundColor: i < currentStep ? '#D4FF26' : 'rgba(212,255,38,0.15)',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 4 },
  pill: { flex: 1, height: 3, borderRadius: 2 },
});
