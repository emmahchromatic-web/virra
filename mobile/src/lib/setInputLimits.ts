/**
 * Limits on what can be typed into a strength set row. Card 297.
 *
 * The reps and weight fields used to take almost anything: 999 reps, 9999.9 kg,
 * and `12.5.5`, which parseFloat quietly saved as 12.5. A typo also spreads,
 * because ticking a set carries its weight into the next one and the next
 * session pre-fills from the last saved weight, so `800` for `80` keeps coming
 * back until someone notices.
 *
 * The rule is to refuse the keystroke and say why, never to clamp: a clamped
 * value is a number the user did not type.
 */

export const MAX_REPS         = 50;
/** A timed hold (plank, wall sit) logs seconds in the same field as reps. */
export const MAX_HOLD_SECONDS = 300;
export const MAX_WEIGHT_KG    = 250;
/** Two places so 1.25 kg plate steps (22.25 kg) can be logged. */
export const WEIGHT_DECIMALS  = 2;

export type SetInputField = 'reps' | 'seconds' | 'weight';

export interface SetInputResult {
  /** What the field should now hold: the typed text if accepted, else the previous value. */
  value: string;
  /** Why the keystroke was refused, for the hint under the row. Null when accepted. */
  hint:  string | null;
}

export function maxFor(field: SetInputField): number {
  if (field === 'weight')  return MAX_WEIGHT_KG;
  if (field === 'seconds') return MAX_HOLD_SECONDS;
  return MAX_REPS;
}

export function limitHint(field: SetInputField): string {
  if (field === 'weight')  return `Max ${MAX_WEIGHT_KG} kg`;
  if (field === 'seconds') return `Max ${MAX_HOLD_SECONDS} s`;
  return `Max ${MAX_REPS} reps`;
}

/**
 * Decide what a set-row field holds after the user edits it.
 *
 * Characters the field can never hold (letters, a minus sign, a second decimal
 * point) are simply dropped. Only going over a limit earns a hint, because that
 * is the one refusal the user would not otherwise understand.
 */
export function limitSetInput(field: SetInputField, previous: string, typed: string): SetInputResult {
  const cleaned = field === 'weight' ? cleanWeight(typed) : typed.replace(/\D/g, '');

  if (field === 'weight') {
    const decimals = cleaned.split('.')[1];
    if (decimals !== undefined && decimals.length > WEIGHT_DECIMALS) {
      return { value: previous, hint: `Up to ${WEIGHT_DECIMALS} decimal places` };
    }
  }

  const n = field === 'weight' ? parseFloat(cleaned) : parseInt(cleaned, 10);
  if (Number.isFinite(n) && n > maxFor(field)) {
    return { value: previous, hint: limitHint(field) };
  }
  return { value: cleaned, hint: null };
}

/**
 * Digits and a single decimal point. A comma is read as the decimal point:
 * iOS shows the region's separator on the decimal pad, and parseFloat('12,5')
 * would otherwise save 12.
 */
function cleanWeight(typed: string): string {
  const s = typed.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
}

/** Whether a weight could have been typed into the field. Used to refuse a bad pre-fill. */
export function isWithinWeightLimit(kg: number): boolean {
  return Number.isFinite(kg) && kg >= 0 && kg <= MAX_WEIGHT_KG;
}

/** A logged weight this far above last time is worth a second look. */
export const JUMP_RATIO  = 2;
/** ...but not for light kit, where 4 kg to 10 kg is ordinary progress. */
export const JUMP_MIN_KG = 10;

/**
 * True when a weight is more than double the last logged weight for the same
 * exercise AND at least 10 kg heavier. Catches the typo that stays under the
 * hard limit (25 kg typed as 250). Never fires without a previous weight, and
 * never for a drop.
 */
export function isBigJump(weightKg: number, lastKg: number | null | undefined): boolean {
  if (lastKg == null || !Number.isFinite(lastKg) || lastKg <= 0) return false;
  if (!Number.isFinite(weightKg)) return false;
  return weightKg > lastKg * JUMP_RATIO && weightKg - lastKg >= JUMP_MIN_KG;
}

/** "40" not "40.00"; "22.25" stays. */
export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}
