const mockSchedule = jest.fn(async (..._a: any[]) => 'notif-1');
const mockCancel   = jest.fn(async (..._a: any[]) => {});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync:        (...a: any[]) => mockSchedule(...a),
  cancelScheduledNotificationAsync: (...a: any[]) => mockCancel(...a),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  dismissAllNotificationsAsync:     jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler:           jest.fn(),
  SchedulableTriggerInputTypes:     { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

import { scheduleRestComplete, cancelRestComplete } from '@/lib/notifications';

beforeEach(() => { mockSchedule.mockClear(); mockCancel.mockClear(); });
afterEach(async () => { await cancelRestComplete(); });

// Card 197: a user backgrounded the app mid-rest, heard nothing, and rested
// longer than intended. iOS suspends the JS runtime, so a scheduled
// notification is the only thing that can reach them.
it('schedules an alert for when the rest ends', async () => {
  await scheduleRestComplete('Barbell Back Squat', Date.now() + 90_000);
  expect(mockSchedule).toHaveBeenCalledTimes(1);
  const arg = mockSchedule.mock.calls[0][0] as any;
  expect(arg.content.title).toBe('Rest complete');
  expect(arg.content.body).toContain('Barbell Back Squat');
  expect(arg.trigger.seconds).toBeGreaterThan(85);
  expect(arg.trigger.seconds).toBeLessThanOrEqual(90);
  expect(arg.trigger.repeats).toBe(false);
});

// If the rest is nearly over the user is plainly watching it, and the in-app
// chime already covers them.
it('does not bother for a rest that is nearly over', async () => {
  await scheduleRestComplete('Push-up', Date.now() + 500);
  expect(mockSchedule).not.toHaveBeenCalled();
});

it('replaces a pending alert rather than stacking a second one', async () => {
  await scheduleRestComplete('Squat', Date.now() + 90_000);
  await scheduleRestComplete('Squat', Date.now() + 90_000);
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(mockSchedule).toHaveBeenCalledTimes(2);
});

it('cancels a pending alert when the rest is skipped', async () => {
  await scheduleRestComplete('Squat', Date.now() + 90_000);
  await cancelRestComplete();
  expect(mockCancel).toHaveBeenCalledWith('notif-1');
});

it('does nothing when there is no alert pending', async () => {
  await cancelRestComplete();
  expect(mockCancel).not.toHaveBeenCalled();
});

// Permission denied must degrade to today's behaviour, not break the set.
it('stays quiet when scheduling is refused', async () => {
  mockSchedule.mockRejectedValueOnce(new Error('permission denied'));
  await expect(scheduleRestComplete('Squat', Date.now() + 90_000)).resolves.toBeUndefined();
  // And with nothing stored, a later cancel is a no-op rather than a crash.
  await cancelRestComplete();
  expect(mockCancel).not.toHaveBeenCalled();
});
