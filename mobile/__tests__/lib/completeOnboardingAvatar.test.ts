/**
 * Card 224: a photo picked during onboarding never reached storage.
 *
 * `completeOnboarding` called `FileSystem.readAsStringAsync`, which
 * expo-file-system 19 (SDK 54) moved to the `/legacy` entry point. The call
 * threw on every run, the catch flagged the upload as failed, and onboarding
 * carried on without a picture.
 *
 * Nothing caught it because `completeOnboarding` itself had no test — only its
 * pure pace helpers did — and every screen test mocks expo-file-system, so the
 * mock supplied whatever API the code happened to ask for.
 */

const mockUpload       = jest.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/avatar.jpg' } });
const mockUpsert       = jest.fn().mockResolvedValue({ error: null });
const mockInsert       = jest.fn().mockResolvedValue({ error: null });
const mockBytes        = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

jest.mock('expo-file-system', () => ({
  File: class {
    constructor(_uri: string) {}
    bytes() { return mockBytes(); }
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from:    () => ({ upsert: mockUpsert, insert: mockInsert }),
    storage: { from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }) },
  },
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: {
    getState: () => ({
      setCycleProfile:    jest.fn(),
      setPeriodStart:     jest.fn(),
      setHormonalSubData: jest.fn(),
    }),
  },
}));

import { completeOnboarding } from '@/lib/completeOnboarding';

const BASE = {
  firstName: 'Emma', lastName: 'Harrison', localAvatarUri: null,
  fitnessLevel: null, runningGoal: null, fiveKTime: '', weeklyMileage: null,
  cycleProfile: 'natural', contraceptionType: null, hasPlaceboWeek: null,
  currentPackStart: null, periodStart: null, cycleLength: 28,
} as never;

beforeEach(() => { jest.clearAllMocks(); });

describe('completeOnboarding — avatar upload', () => {
  it('uploads the picked photo and records the URL on the profile', async () => {
    const result = await completeOnboarding('user-1', { ...(BASE as object), localAvatarUri: 'file:///tmp/pic.jpg' } as never);

    expect(mockBytes).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith(
      'user-1/avatar.jpg',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: expect.stringContaining('https://cdn/avatar.jpg') }),
    );
    expect(result.avatarFailed).toBeFalsy();
    expect(result.error).toBeUndefined();
  });

  it('completes onboarding and flags the failure when the file cannot be read', async () => {
    mockBytes.mockRejectedValueOnce(new Error('no such file'));

    const result = await completeOnboarding('user-1', { ...(BASE as object), localAvatarUri: 'file:///tmp/gone.jpg' } as never);

    // The picture is optional; losing it must never cost the sign-up.
    expect(result.error).toBeUndefined();
    expect(mockUpsert).toHaveBeenCalled();
    expect(result.avatarFailed).toBe(true);
    expect(mockUpsert.mock.calls[0][0]).not.toHaveProperty('avatar_url');
  });

  it('does not touch storage when no photo was picked', async () => {
    const result = await completeOnboarding('user-1', BASE);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(result.avatarFailed).toBeFalsy();
  });
});
