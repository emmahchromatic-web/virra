import { INJURY_LEVELS, INJURY_LABEL, type InjuryLevel } from '@/lib/injuryLevels';

// The onboarding step and the profile editor both render from INJURY_LEVELS and
// write the value straight to user_profiles.injury_level, which carries a check
// constraint. If the two ever disagree the write fails at runtime with a
// constraint violation, so pin the set here — this test is the thing that
// should break when someone edits the list without touching the migration.
const ALLOWED_BY_MIGRATION = ['none', 'niggles', 'managing', 'declined'];

describe('injury levels', () => {
  it('matches the values allowed by the check constraint', () => {
    expect(INJURY_LEVELS.map((o) => o.value)).toEqual(ALLOWED_BY_MIGRATION);
  });

  it('has no duplicate values', () => {
    const values = INJURY_LEVELS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('gives every option a label, and a lookup for both screens', () => {
    const missing = INJURY_LEVELS.filter((o) => !o.label.trim()).map((o) => o.value);
    expect(missing).toEqual([]);
    ALLOWED_BY_MIGRATION.forEach((v) => {
      expect(INJURY_LABEL[v as InjuryLevel]).toBeTruthy();
    });
  });

  it("only omits the supporting detail on 'rather not say'", () => {
    const withoutDetail = INJURY_LEVELS.filter((o) => !o.detail).map((o) => o.value);
    expect(withoutDetail).toEqual(['declined']);
  });
});
