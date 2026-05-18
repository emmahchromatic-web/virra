import { swapSessions } from '@/lib/swapSessions';

jest.mock('@/lib/scheduleGenerator', () => ({
  moveSession: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { moveSession } = require('@/lib/scheduleGenerator');

describe('swapSessions', () => {
  beforeEach(() => moveSession.mockReset());

  it('calls moveSession twice — A to bDate then B to aDate', async () => {
    moveSession.mockResolvedValue(undefined);
    await swapSessions('a', 'b', '2026-05-18', '2026-05-20', 'user-1');
    expect(moveSession).toHaveBeenNthCalledWith(1, 'a', '2026-05-20', 'user-1');
    expect(moveSession).toHaveBeenNthCalledWith(2, 'b', '2026-05-18', 'user-1');
  });

  it('rolls A back to its source date if B fails', async () => {
    moveSession
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('B failed'))
      .mockResolvedValueOnce(undefined);
    await expect(
      swapSessions('a', 'b', '2026-05-18', '2026-05-20', 'user-1'),
    ).rejects.toThrow('B failed');
    expect(moveSession).toHaveBeenNthCalledWith(3, 'a', '2026-05-18', 'user-1');
  });

  it('throws even if rollback fails (best-effort)', async () => {
    moveSession
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('B failed'))
      .mockRejectedValueOnce(new Error('rollback failed'));
    await expect(
      swapSessions('a', 'b', '2026-05-18', '2026-05-20', 'user-1'),
    ).rejects.toThrow('B failed');
  });
});
