// --- TYPES ---

export type DistanceUnit = 'km' | 'mi';

export interface PaceResult {
  paceSecsPerKm: number;
  paceSecsPerMile: number;
  totalSecs: number;
  distanceKm: number;
  splits: Split[];
}

export interface Split {
  label: string;
  paceDisplay: string;
}

export interface PredictionResult {
  riegelSecs: number;
  cameronSecs: number;
  display: string;
}

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export interface PhaseInfo {
  phase: CyclePhase;
  dayInPhase: number;
  dayInCycle: number;
  paceModifier: number;
}

// --- UTILS ---

export function secsToHMS(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function secsToMMSS(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseHMS(input: string): number {
  const trimmed = input.trim();
  if (!trimmed || trimmed === ':' || trimmed === '::') throw new Error('Invalid time format');
  const parts = trimmed.split(':').map(Number);
  if (parts.some(Number.isNaN)) throw new Error('Invalid time format');
  if (parts.some(p => p < 0)) throw new Error('Invalid time format');
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0] * 60;
  throw new Error('Invalid time format');
}

export function parseMMSS(input: string): number {
  return parseHMS(input);
}

const KM_PER_MILE = 1.60934;

export function distanceToKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value * KM_PER_MILE : value;
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

// --- MODE 1: PACE / TIME / DISTANCE ---

export function calcTime(distanceKm: number, paceSecsPerKm: number): number {
  return distanceKm * paceSecsPerKm;
}

export function calcPace(distanceKm: number, totalSecs: number): number {
  if (distanceKm === 0) throw new Error('Distance cannot be zero');
  return totalSecs / distanceKm;
}

export function calcDistance(totalSecs: number, paceSecsPerKm: number): number {
  if (paceSecsPerKm === 0) throw new Error('Pace cannot be zero');
  return totalSecs / paceSecsPerKm;
}

export function buildSplits(distanceKm: number, paceSecsPerKm: number, unit: DistanceUnit): Split[] {
  const splits: Split[] = [];
  const totalUnits = unit === 'km' ? distanceKm : kmToMiles(distanceKm);
  const pacePerUnit = unit === 'km' ? paceSecsPerKm : paceSecsPerKm * KM_PER_MILE;
  const fullSplits = Math.floor(totalUnits);
  for (let i = 1; i <= fullSplits; i++) {
    splits.push({ label: `${i} ${unit}`, paceDisplay: secsToMMSS(pacePerUnit) });
  }
  const remainder = totalUnits - fullSplits;
  if (remainder > 0.01) {
    splits.push({ label: `+${remainder.toFixed(2)} ${unit}`, paceDisplay: secsToMMSS(pacePerUnit) });
  }
  return splits;
}

// --- MODE 2: RACE TIME PREDICTOR (Riegel + Cameron) ---

const KNOWN_DISTANCES_KM: Record<string, number> = {
  '5K': 5,
  '10K': 10,
  'Half Marathon': 21.0975,
  'Marathon': 42.195,
};

export function getKnownDistanceKm(label: string): number | undefined {
  return KNOWN_DISTANCES_KM[label];
}

export function riegelPredict(t1Secs: number, d1Km: number, d2Km: number): number {
  return t1Secs * Math.pow(d2Km / d1Km, 1.06);
}

export function cameronPredict(t1Secs: number, d1Km: number, d2Km: number): number {
  const d1m = d1Km * 1000;
  const d2m = d2Km * 1000;
  const a = 13.49681 - 0.000030363 * d1m + (835.7114 / Math.pow(d1m, 0.7905));
  const b = 13.49681 - 0.000030363 * d2m + (835.7114 / Math.pow(d2m, 0.7905));
  return (t1Secs / d1m) * (a / b) * d2m;
}

// --- MODE 3: CYCLE-AWARE PACE ---

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function getCurrentPhase(periodStart: Date, cycleLength: number, today: Date): PhaseInfo {
  const dayInCycle = ((daysBetween(periodStart, today) % cycleLength) + cycleLength) % cycleLength;

  let phase: CyclePhase;
  let dayInPhase: number;
  let paceModifier: number;

  if (dayInCycle < 5) {
    phase = 'menstrual';
    dayInPhase = dayInCycle + 1;
    paceModifier = -0.10;
  } else if (dayInCycle < 13) {
    phase = 'follicular';
    dayInPhase = dayInCycle - 4;
    paceModifier = 0.05;
  } else if (dayInCycle < 16) {
    phase = 'ovulatory';
    dayInPhase = dayInCycle - 12;
    paceModifier = 0.08;
  } else {
    phase = 'luteal';
    dayInPhase = dayInCycle - 15;
    paceModifier = -0.05;
  }

  return { phase, dayInPhase, dayInCycle, paceModifier };
}

export function applyPaceModifier(basePaceSecsPerKm: number, modifier: number): number {
  return basePaceSecsPerKm * (1 - modifier);
}
