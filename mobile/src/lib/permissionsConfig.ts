import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PERMISSIONS_GRANTED_KEY = 'permissions_granted_v1';

export interface PermissionItem {
  id:       'health' | 'location' | 'notifications' | 'camera' | 'photos';
  label:    string;
  title:    string;
  headline: string;
  body:     string;
  why:      string;
  optional: boolean;
}

export const PERMISSIONS: readonly PermissionItem[] = [
  {
    id:       'health',
    label:    'HEALTH + ACTIVITY',
    title:    'Health',
    headline: 'Your health data, working for you.',
    body:     "Virra reads your workout history to pre-fill your fitness baseline, and pulls cycle data if you've logged it in Apple Health.",
    why:      'Raw health records stay in Apple Health on your device. Virra only processes aggregated training and cycle signals to generate your plan and insights, and never sells health data.',
    optional: false,
  },
  {
    id:       'location',
    label:    'LOCATION',
    title:    'Location',
    headline: 'Track every run, automatically.',
    body:     'Virra uses GPS to map routes, measure pace in real time, and log splits. The screen can lock during a run; Virra keeps recording in the background until you tap Finish.',
    why:      "We ask for When in Use only, never Always. Location is only collected during an active run.",
    optional: false,
  },
  {
    id:       'notifications',
    label:    'REMINDERS + ALERTS',
    title:    'Reminders',
    headline: 'Stay on track without checking the app.',
    body:     'Virra sends smart reminders that cancel themselves as soon as the action is done.',
    why:      "Training reminders cancel when your workout is logged. Nutrition reminders cancel when you've logged a meal.",
    optional: false,
  },
  {
    id:       'camera',
    label:    'CAMERA',
    title:    'Camera',
    headline: 'Log food in seconds.',
    body:     'Scan any barcode to log food instantly, with no typing and no searching.',
    why:      'You can always add this later in Settings. It only affects barcode scanning.',
    optional: true,
  },
  {
    id:       'photos',
    label:    'PHOTOS',
    title:    'Photos',
    headline: 'Put a face to your profile.',
    body:     'Virra opens your photo library so you can pick a profile picture.',
    why:      'We only read the single image you choose. Virra never browses your library, and the photo is stored against your profile alone.',
    optional: true,
  },
] as const;

// Single source of truth for the HK permission set so onboarding, re-permissions,
// and app-launch init all establish the same bridge.
function buildHKPermissions() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Constants } = require('react-native-health');
  return {
    permissions: {
      read: [
        Constants.Permissions.HeartRate,
        Constants.Permissions.RestingHeartRate,
        Constants.Permissions.HeartRateVariability,
        Constants.Permissions.ActiveEnergyBurned,
        Constants.Permissions.AppleExerciseTime,
        Constants.Permissions.ActivitySummary,
        Constants.Permissions.DistanceWalkingRunning,
        Constants.Permissions.Steps,
        Constants.Permissions.Vo2Max,
        Constants.Permissions.SleepAnalysis,
        Constants.Permissions.Weight,
        Constants.Permissions.Workout,
      ],
      write: [
        Constants.Permissions.Workout,
        Constants.Permissions.EnergyConsumed,
        Constants.Permissions.Carbohydrates,
        Constants.Permissions.Protein,
        Constants.Permissions.FatTotal,
        Constants.Permissions.Fiber,
      ],
    },
  };
}

// Establishes the HK JS↔native bridge for the current session. Safe to call on
// every app launch: when permissions were already granted iOS does not re-prompt.
export async function initHealthKitForSession(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    const HK = NativeModules.AppleHealthKit;
    if (!HK?.initHealthKit) return;
    await new Promise<void>((resolve) => {
      HK.initHealthKit(buildHKPermissions(), () => resolve());
    });
  } catch { /* HK unavailable (simulator etc.) */ }
}

export async function requestPermission(id: PermissionItem['id']): Promise<void> {
  switch (id) {
    case 'health': {
      await initHealthKitForSession();
      try {
        const { requestMenstrualPermission } = await import('@/modules/menstrual-health');
        await requestMenstrualPermission();
      } catch { /* HK unavailable */ }
      break;
    }
    case 'location':
      // When-In-Use only. Combined with UIBackgroundModes: ["location"] in
      // app.json, iOS keeps delivering updates while the app is backgrounded
      // during an active run; no "Always" permission required.
      await Location.requestForegroundPermissionsAsync();
      break;
    case 'notifications':
      await Notifications.requestPermissionsAsync();
      break;
    case 'camera':
      await Camera.requestCameraPermissionsAsync();
      break;
    case 'photos':
      // Onboarding has always opened the library to pick an avatar, so the
      // permission has always been asked for. It just was not listed here,
      // which made the screen an incomplete answer to "what has Virra got?".
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      break;
  }
}

export async function markPermissionsGranted(): Promise<void> {
  await AsyncStorage.setItem(PERMISSIONS_GRANTED_KEY, '1');
}

export async function hasPermissionsBeenGranted(): Promise<boolean> {
  const v = await AsyncStorage.getItem(PERMISSIONS_GRANTED_KEY);
  return v === '1';
}

/**
 * Returns the route a profile-complete user should land on after authenticating.
 * Centralizes the "have device permissions been granted on this install?" check
 * so every post-auth path (sign-in, paywall, dev bypass, cold-start) routes
 * consistently. AsyncStorage clears on iOS reinstall, so a missing flag means
 * device permissions were wiped and we need to re-prompt.
 */
export async function getPostAuthRoute(): Promise<'/(app)/(tabs)' | '/re-permissions'> {
  const granted = await hasPermissionsBeenGranted();
  if (granted) {
    initHealthKitForSession();
    return '/(app)/(tabs)';
  }
  return '/re-permissions';
}

export type PermissionStatusValue = 'granted' | 'denied' | 'undetermined';

export interface PermissionStatusEntry {
  id:          PermissionItem['id'];
  status:      PermissionStatusValue;
  canAskAgain: boolean;
}

// iOS HealthKit doesn't let apps inspect read-permission status (privacy guarantee).
// We treat the AsyncStorage flag as our best signal that HK was granted; the user
// can manage individual data types in the Health app.
export async function getPermissionsStatus(): Promise<PermissionStatusEntry[]> {
  const [healthFlag, locRes, notifRes, camRes, photoRes] = await Promise.all([
    hasPermissionsBeenGranted(),
    Location.getForegroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Camera.getCameraPermissionsAsync(),
    ImagePicker.getMediaLibraryPermissionsAsync(),
  ]);

  const notifGranted =
    notifRes.granted ||
    notifRes.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    notifRes.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;

  return [
    { id: 'health',        status: healthFlag ? 'granted' : 'undetermined', canAskAgain: !healthFlag },
    { id: 'location',      status: locRes.status as PermissionStatusValue,   canAskAgain: locRes.canAskAgain ?? false },
    { id: 'notifications', status: notifGranted ? 'granted' : (notifRes.status as PermissionStatusValue), canAskAgain: notifRes.canAskAgain ?? false },
    { id: 'camera',        status: camRes.status as PermissionStatusValue,   canAskAgain: camRes.canAskAgain ?? false },
    { id: 'photos',        status: photoRes.status as PermissionStatusValue, canAskAgain: photoRes.canAskAgain ?? false },
  ];
}
