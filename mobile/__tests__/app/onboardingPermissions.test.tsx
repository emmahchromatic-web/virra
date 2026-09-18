import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockPush    = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a) },
  useFocusEffect: (cb: () => void) => { const R = jest.requireActual('react'); R.useEffect(cb, []); },
}));
jest.mock('@/context/OnboardingContext', () => ({ useOnboarding: () => ({ setStep: jest.fn() }) }));
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getForegroundPermissionsAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({ requestPermissionsAsync: jest.fn(), getPermissionsAsync: jest.fn(), IosAuthorizationStatus: {} }));
jest.mock('expo-camera', () => ({ Camera: { requestCameraPermissionsAsync: jest.fn(), getCameraPermissionsAsync: jest.fn() } }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), getMediaLibraryPermissionsAsync: jest.fn(),
}));

const mockRequest = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/permissionsConfig', () => ({
  ...jest.requireActual('@/lib/permissionsConfig'),
  requestPermission:      (id: string) => mockRequest(id),
  markPermissionsGranted: jest.fn(),
}));

import OnboardingPermissions from '@/app/(onboarding)/permissions';
import RePermissions from '@/app/re-permissions';
import { PERMISSIONS } from '@/lib/permissionsConfig';

beforeEach(() => { mockRequest.mockClear(); mockPush.mockClear(); mockReplace.mockClear(); });

async function walk(utils: ReturnType<typeof render>, steps: number) {
  const seen: string[] = [];
  for (let i = 1; i <= steps; i++) {
    expect(utils.getByText(`${i} of ${steps}`)).toBeTruthy();
    await act(async () => { fireEvent.press(utils.getByText('CONTINUE')); });
  }
  return seen;
}

/**
 * Card 302. Onboarding asked for Photos as step 5 of 5, after the profile photo
 * had already been picked. A permission is asked when it is used.
 */
describe('onboarding permissions', () => {
  it('walks 4 steps, never shows or asks for Photos, then moves on', async () => {
    const utils = render(<OnboardingPermissions />);
    expect(utils.queryByText('PHOTOS')).toBeNull();
    await walk(utils, 4);
    expect(mockRequest.mock.calls.map((c) => c[0])).toEqual(['health', 'location', 'notifications', 'camera']);
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/fitness');
  });

  it('re-permissions after sign-in skips Photos too', async () => {
    const utils = render(<RePermissions />);
    await walk(utils, 4);
    expect(mockRequest.mock.calls.map((c) => c[0])).not.toContain('photos');
    expect(mockReplace).toHaveBeenCalled();
  });

  it('Settings still lists Photos, so the list of what Virra can access stays complete', () => {
    expect(PERMISSIONS.map((p) => p.id)).toContain('photos');
  });
});
