import { deriveDayState, type SessionForDay } from '@/lib/dayState';

const planned  = (modality: SessionForDay['modality']): SessionForDay =>
  ({ status: 'planned',   modality });
const done     = (modality: SessionForDay['modality']): SessionForDay =>
  ({ status: 'completed', modality });

describe('deriveDayState', () => {
  test('zero sessions → rest', () => {
    expect(deriveDayState([], false)).toEqual({ kind: 'rest' });
    expect(deriveDayState([], true)).toEqual({ kind: 'rest' });
  });

  test('1 completed (past)   → completed', () => {
    expect(deriveDayState([done('run')], true))
      .toEqual({ kind: 'completed', modality: 'run' });
  });

  test('1 completed (today)  → completed', () => {
    expect(deriveDayState([done('strength')], false))
      .toEqual({ kind: 'completed', modality: 'strength' });
  });

  test('1 planned future     → planned', () => {
    expect(deriveDayState([planned('run')], false))
      .toEqual({ kind: 'planned', modality: 'run' });
  });

  test('1 planned today      → planned (not missed)', () => {
    expect(deriveDayState([planned('run')], false))
      .toEqual({ kind: 'planned', modality: 'run' });
  });

  test('1 planned past       → missed', () => {
    expect(deriveDayState([planned('run')], true))
      .toEqual({ kind: 'missed' });
  });

  test('2 completed past     → completed_multi (priority order)', () => {
    expect(deriveDayState([done('strength'), done('run')], true))
      .toEqual({ kind: 'completed_multi', a: 'run', b: 'strength' });
  });

  test('2 planned future     → planned_multi (priority order)', () => {
    expect(deriveDayState([planned('yoga'), planned('strength')], false))
      .toEqual({ kind: 'planned_multi', a: 'strength', b: 'yoga' });
  });

  test('2 planned past, none done → missed', () => {
    expect(deriveDayState([planned('run'), planned('strength')], true))
      .toEqual({ kind: 'missed' });
  });

  test('2 past, 1 done + 1 missed → mixed (completed modality)', () => {
    expect(deriveDayState([done('strength'), planned('run')], true))
      .toEqual({ kind: 'mixed', completed: 'strength' });
  });

  test('mixed picks top completed by priority when >1 done', () => {
    expect(deriveDayState([done('strength'), done('swim'), planned('yoga')], true))
      .toEqual({ kind: 'mixed', completed: 'strength' });
  });

  test('3 planned future → planned_multi using top 2 by priority', () => {
    expect(deriveDayState(
      [planned('swim'), planned('run'), planned('yoga')], false))
      .toEqual({ kind: 'planned_multi', a: 'run', b: 'swim' });
  });

  test('priority is stable regardless of insertion order', () => {
    expect(deriveDayState([planned('other'), planned('run')], false))
      .toEqual({ kind: 'planned_multi', a: 'run', b: 'other' });
  });

  test('3 sessions, top 2 done + 3rd missed → mixed (full-list rule)', () => {
    expect(deriveDayState(
      [done('run'), done('strength'), planned('yoga')], true))
      .toEqual({ kind: 'mixed', completed: 'run' });
  });
});
