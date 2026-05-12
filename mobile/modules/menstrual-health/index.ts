import { requireNativeModule } from 'expo-modules-core';

interface MenstrualHealthNative {
  requestPermission():           Promise<boolean>;
  getRecentPeriodStarts():       Promise<string[]>;
  logPeriodStart(iso: string):   Promise<boolean>;
}

let mod: MenstrualHealthNative | null = null;
try {
  mod = requireNativeModule('MenstrualHealth') as MenstrualHealthNative;
} catch {
  // Module unavailable (simulator without HealthKit, Android, etc.)
}

export async function requestMenstrualPermission(): Promise<boolean> {
  return mod?.requestPermission() ?? Promise.resolve(false);
}

export async function getRecentPeriodStarts(): Promise<string[]> {
  return mod?.getRecentPeriodStarts() ?? Promise.resolve([]);
}

export async function logPeriodStartToHealth(isoDate: string): Promise<boolean> {
  return mod?.logPeriodStart(isoDate) ?? Promise.resolve(false);
}
