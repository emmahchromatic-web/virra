import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Loaded lazily so the audio module is only touched by users who actually
// train with the logger open.
let player: AudioPlayer | null = null;
let configured = false;

async function ensurePlayer(): Promise<AudioPlayer> {
  if (!configured) {
    // playsInSilentMode false is the point, not an oversight: a phone on silent
    // in a gym class should stay silent. The haptic still fires.
    await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false });
    configured = true;
  }
  if (!player) player = createAudioPlayer(require('../../assets/rest-complete.wav'));
  return player;
}

/**
 * Signal the end of a rest period: haptic plus a short tone.
 *
 * Both are suppressed unless the app is in the foreground. The timer keeps
 * running while the user is elsewhere on their phone, but it must not buzz or
 * beep at them from the background.
 */
export async function playRestComplete(): Promise<void> {
  if (AppState.currentState !== 'active') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  try {
    const p = await ensurePlayer();
    p.seekTo(0);
    p.play();
  } catch {
    // A missing or busy audio session must never interrupt a workout.
  }
}

/** Test seam: drop the cached player so mocks don't leak between specs. */
export function __resetRestChime(): void {
  player = null;
  configured = false;
}
