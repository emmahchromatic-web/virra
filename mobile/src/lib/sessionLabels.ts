/**
 * How a planned session's `session_label` is written on screen.
 *
 * Found on the simulator, 2026-09-12: a Path to parkrun session showed as
 * **RUN_WALK** on the training tab, the tab bar and the session detail. The
 * plan detail screen got it right, because that one screen had a private
 * lookup table with `run_walk: 'Run/walk'` in it. Nothing else did.
 *
 * The map was never the real problem. Every other surface fell back to
 * `label.charAt(0).toUpperCase() + label.slice(1)`, which cannot render any
 * label made of two words — it just leaves the underscore showing. `run_walk`
 * is the first compound label the generator produces and it will not be the
 * last, so the fix is the FALLBACK: split on underscores, then capitalise.
 * A future `hill_reps` or `long_ride` then reads correctly on day one without
 * anyone remembering to add a row here.
 *
 * The table remains for the cases where plain capitalisation is not what a
 * runner would call the thing: `long` is "Long run", not "Long".
 */

const SESSION_TEXT: Record<string, string> = {
  easy:      'Easy',
  tempo:     'Tempo',
  threshold: 'Threshold',
  intervals: 'Intervals',
  long:      'Long run',
  run_walk:  'Run/walk',
  race:      'Race',
  recovery:  'Recovery',
  strength:  'Strength',
  lower:     'Lower body',
  upper:     'Upper body',
  general:   'Full body',
  rest:      'Rest',
};

/** Underscores become spaces, first letter capitalised, rest left alone. */
function humanise(label: string): string {
  const words = label.replace(/_+/g, ' ').trim().toLowerCase();
  if (words.length === 0) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Sentence case, for headings and body text: "Run/walk", "Long run". */
export function sessionLabelText(label: string | null | undefined): string {
  if (!label) return '';
  return SESSION_TEXT[label] ?? humanise(label);
}

/** Upper case, for the mono labels this app uses as eyebrows: "RUN/WALK". */
export function sessionLabelUpper(label: string | null | undefined): string {
  return sessionLabelText(label).toUpperCase();
}
