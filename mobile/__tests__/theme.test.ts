import { colors, fonts, spacing, radius } from '@/constants/theme';

describe('theme tokens', () => {
  it('has correct brand colors', () => {
    expect(colors.pulse).toBe('#D4FF26');
    expect(colors.heat).toBe('#FF2E7E');
    expect(colors.mile).toBe('#0A0A0F');
    expect(colors.breath).toBe('#F4EDE0');
    expect(colors.dawn).toBe('#FF6B3D');
    expect(colors.mist).toBe('#1C1C24');
  });

  it('has all required font keys', () => {
    expect(fonts.display).toBeDefined();
    expect(fonts.serif).toBeDefined();
    expect(fonts.body).toBeDefined();
    expect(fonts.mono).toBeDefined();
  });

  it('has standard spacing scale', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
  });
});

describe('modality palette additions', () => {
  it('exposes slate token for swim', () => {
    expect(colors.slate).toBe('#9DB8AC');
  });
  it('exposes sage token for hike', () => {
    expect(colors.sage).toBe('#94B062');
  });
  it('exposes peach token for cycle', () => {
    expect(colors.peach).toBe('#F5A077');
  });
});
