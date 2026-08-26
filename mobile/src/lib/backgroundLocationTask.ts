import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import type { GpsPoint } from './runTracking';

export const BACKGROUND_LOCATION_TASK = 'virra-background-run-location';

type Listener = (point: GpsPoint) => void;

let listener: Listener | null = null;
const buffer: GpsPoint[] = [];

// Defined at module scope (imported unconditionally from app/_layout.tsx) so
// the task is registered on every launch — required for iOS to redeliver
// locations to this handler even if the run screen isn't mounted yet.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[backgroundLocationTask]', error.message);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  for (const loc of locations) {
    const point: GpsPoint = {
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      ts:  loc.timestamp,
      alt: loc.coords.altitude ?? undefined,
    };
    if (listener) listener(point); else buffer.push(point);
  }
});

// The run screen subscribes while mounted; any points delivered before it
// subscribes (e.g. the task fires between app launch and screen mount) are
// buffered and flushed to the new listener immediately.
export function subscribeToBackgroundLocations(cb: Listener): () => void {
  listener = cb;
  while (buffer.length) cb(buffer.shift()!);
  return () => { if (listener === cb) listener = null; };
}

// Returns 'background' if tracking will survive the app being backgrounded,
// 'foreground-only' if the user declined background permission (tracking
// still works while the screen is active), or false if even foreground
// location was declined.
export async function startBackgroundLocationTracking(): Promise<'background' | 'foreground-only' | false> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  const bg = await Location.requestBackgroundPermissionsAsync();

  const alreadyStarted = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy:                       Location.Accuracy.BestForNavigation,
      timeInterval:                   1000,
      distanceInterval:               5,
      activityType:                   Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: bg.status === 'granted',
      pausesUpdatesAutomatically:      false,
    });
  }

  return bg.status === 'granted' ? 'background' : 'foreground-only';
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  const started = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  buffer.length = 0;
}
