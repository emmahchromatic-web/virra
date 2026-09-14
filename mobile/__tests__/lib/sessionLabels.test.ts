import { sessionLabelText, sessionLabelUpper } from '@/lib/sessionLabels';

describe('sessionLabelText', () => {
  it('writes the compound label that started this', () => {
    // Shown as RUN_WALK on the training tab before this existed.
    expect(sessionLabelText('run_walk')).toBe('Run/walk');
  });

  it('calls a long run a long run, not "Long"', () => {
    expect(sessionLabelText('long')).toBe('Long run');
  });

  it('handles the everyday labels', () => {
    expect(sessionLabelText('easy')).toBe('Easy');
    expect(sessionLabelText('tempo')).toBe('Tempo');
    expect(sessionLabelText('race')).toBe('Race');
  });

  it('handles the strength labels', () => {
    expect(sessionLabelText('lower')).toBe('Lower body');
    expect(sessionLabelText('general')).toBe('Full body');
  });

  it('never leaves an underscore on screen, even for a label it has never seen', () => {
    // This is the actual fix. A map entry only rescues the label you thought
    // of; the fallback rescues the next one too.
    expect(sessionLabelText('hill_reps')).toBe('Hill reps');
    expect(sessionLabelText('long_ride')).toBe('Long ride');
    expect(sessionLabelText('a_b_c')).toBe('A b c');
  });

  it('does not shout when the database does', () => {
    expect(sessionLabelText('RUN_WALK')).toBe('Run walk');
  });

  it('survives null, undefined and empty', () => {
    expect(sessionLabelText(null)).toBe('');
    expect(sessionLabelText(undefined)).toBe('');
    expect(sessionLabelText('')).toBe('');
    expect(sessionLabelText('   ')).toBe('');
  });
});

describe('sessionLabelUpper', () => {
  it('shouts the mapped text rather than the raw key', () => {
    expect(sessionLabelUpper('run_walk')).toBe('RUN/WALK');
    expect(sessionLabelUpper('long')).toBe('LONG RUN');
  });

  it('carries the fallback through, so no underscore survives either', () => {
    expect(sessionLabelUpper('hill_reps')).toBe('HILL REPS');
  });

  it('survives null', () => {
    expect(sessionLabelUpper(null)).toBe('');
  });
});
