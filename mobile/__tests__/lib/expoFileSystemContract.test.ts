/**
 * Card 224 shipped because an SDK upgrade moved an API out from under us and
 * every test mocked the module, so the real one was never consulted.
 *
 * This pins the surface the app actually depends on against the INSTALLED
 * package, deliberately unmocked. If a future expo-file-system moves `File`
 * the way 19.x moved `readAsStringAsync`, this fails instead of silently
 * losing profile pictures.
 */
jest.unmock('expo-file-system');

describe('expo-file-system API contract', () => {
  it('exports the File class the upload paths are written against', () => {
    const fs = jest.requireActual('expo-file-system');
    expect(typeof fs.File).toBe('function');
  });

  it('still exports readAsStringAsync, but only as a stub that throws', async () => {
    // This is the trap card 224 fell into. The symbol is present, so the code
    // type-checks and reads fine; calling it throws a migration error at
    // runtime. Anything reaching for it must import from
    // `expo-file-system/legacy` instead.
    const fs = jest.requireActual('expo-file-system');
    await expect(fs.readAsStringAsync('file:///x.jpg', { encoding: 'base64' }))
      .rejects.toThrow(/deprecated/i);
  });
});
