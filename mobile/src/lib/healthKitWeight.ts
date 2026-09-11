import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getCycleInfo } from '@/lib/cycleEngine';
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';
import { initHealthKitForSession } from '@/lib/permissionsConfig';
import { useProfileStore } from '@/store/profile';

const DIAG_KEY = 'hk_weight_diag_v1';

export interface WeightSyncDiagnostic {
  ranAt:        string;          // ISO timestamp of the attempt
  startDate:    string;          // window we asked HK for
  bridgeReady:  boolean;         // was HK.getWeightSamples available
  error:        string | null;   // HK error string if any
  samples:      number;          // raw count from HK
  imported:     number;          // rows upserted
}

async function writeDiag(diag: WeightSyncDiagnostic): Promise<void> {
  try { await AsyncStorage.setItem(DIAG_KEY, JSON.stringify(diag)); } catch { /* best effort */ }
}

export async function readWeightSyncDiagnostic(): Promise<WeightSyncDiagnostic | null> {
  try {
    const raw = await AsyncStorage.getItem(DIAG_KEY);
    return raw ? JSON.parse(raw) as WeightSyncDiagnostic : null;
  } catch {
    return null;
  }
}

const ANCHOR_KEY = 'hk_weight_anchor_v1';

export function gramsToKg(grams: number): number | null {
  if (grams <= 0) return null;
  return Math.round(grams / 100) / 10;
}

export interface RawWeightSample {
  value:     number;
  startDate: string;
  endDate:   string;
}

export interface BodyWeightRow {
  user_id:             string;
  recorded_on:         string;
  weight_kg:           number;
  source:              'healthkit' | 'manual';
  cycle_day_at_time:   number | null;
  cycle_phase_at_time: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
}

/**
 * How far BEFORE the known period start a reading may still be phase-stamped.
 *
 * Card 239. Enabling weight tracking backfills up to a year of HealthKit
 * history, and every imported reading used to be stamped by projecting the one
 * period start the user had just typed *backwards* at a fixed cycle length.
 * Real cycles vary by a few days each time and the error compounds, so a label
 * two or three cycles back is a guess wearing the same clothes as an
 * observation -- and `buildPhaseBands` then learns the personalised band from
 * those guesses. The band is the thing that tells a woman her weight is normal
 * for her phase, so a confidently wrong one is the failure this whole feature
 * exists to prevent.
 *
 * 60 days is roughly two cycles: recent enough that the projection is
 * defensible, short enough that the compounding error stays under a phase.
 * Readings older than that keep a null phase, which every consumer already
 * handles -- `phaseDeltas` skips them and `medianFollicular` ignores them.
 *
 * Readings AFTER the period start are not capped: those are projected forward
 * within a cycle we actually know about.
 */
export const RETRO_PHASE_WINDOW_DAYS = 60;

export function withinRetroPhaseWindow(
  readingDate: Date,
  periodStart: Date,
  windowDays: number = RETRO_PHASE_WINDOW_DAYS,
): boolean {
  const daysBefore = (periodStart.getTime() - readingDate.getTime()) / 86400000;
  return daysBefore <= windowDays;
}

export function sampleToRow(
  userId:      string,
  sample:      RawWeightSample,
  periodStart: Date | null,
  cycleLength: number,
): BodyWeightRow | null {
  const kg = gramsToKg(sample.value);
  if (kg === null) return null;
  const date       = new Date(sample.startDate);
  const recordedOn = date.toLocaleDateString('en-CA');

  let cycleDay:   number | null = null;
  let cyclePhase: BodyWeightRow['cycle_phase_at_time'] = null;
  if (periodStart && withinRetroPhaseWindow(date, periodStart)) {
    const info = getCycleInfo(periodStart, cycleLength, date);
    cycleDay   = info.dayOfCycle;
    cyclePhase = info.phase;
  }

  return {
    user_id:             userId,
    recorded_on:         recordedOn,
    weight_kg:           kg,
    source:              'healthkit',
    cycle_day_at_time:   cycleDay,
    cycle_phase_at_time: cyclePhase,
  };
}

interface ImportContext {
  userId:      string;
  periodStart: Date | null;
  cycleLength: number;
}

/**
 * Forces a full historical backfill from HealthKit. Used when the user first
 * enables weight tracking (or re-enables it) so the chart isn't empty.
 *
 * The persistent anchor (`hk_weight_anchor_v1`) defeats this on re-enable; we
 * clear it so the next `importNewWeightSamples` defaults back to the 1-year
 * lookback window.
 */
export async function enableWeightTracking(ctx: ImportContext): Promise<number> {
  // Make sure the JS↔native HK bridge is up before we query weight samples
  // if the user enables tracking before any other HK-using surface initialised
  // the bridge, `getWeightSamples` would silently return empty.
  await initHealthKitForSession();
  await AsyncStorage.removeItem(ANCHOR_KEY);
  return importNewWeightSamples(ctx);
}

export async function importNewWeightSamples(ctx: ImportContext): Promise<number> {
  const ranAt = new Date().toISOString();
  const HK = NativeModules.AppleHealthKit;
  const bridgeReady = !!HK?.getWeightSamples;
  if (!bridgeReady) {
    await writeDiag({ ranAt, startDate: '', bridgeReady: false, error: 'bridge unavailable', samples: 0, imported: 0 });
    return 0;
  }

  let Constants: any;
  try {
    Constants = require('react-native-health').Constants;
  } catch {
    await writeDiag({ ranAt, startDate: '', bridgeReady: true, error: 'react-native-health not loadable', samples: 0, imported: 0 });
    return 0;
  }

  const anchorISO = await AsyncStorage.getItem(ANCHOR_KEY);
  const startDate = anchorISO ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const { error: hkErr, samples } = await new Promise<{ error: string | null; samples: RawWeightSample[] }>((resolve) => {
    HK.getWeightSamples(
      { unit: Constants.Units.gram, startDate, ascending: true },
      (err: string, results: RawWeightSample[]) => {
        if (err) {
          console.warn('[healthKitWeight] getWeightSamples error:', err);
          return resolve({ error: String(err), samples: [] });
        }
        if (!Array.isArray(results)) {
          console.warn('[healthKitWeight] getWeightSamples returned non-array');
          return resolve({ error: 'non-array result', samples: [] });
        }
        resolve({ error: null, samples: results });
      },
    );
  });

  if (!samples.length) {
    console.log('[healthKitWeight] no samples returned from HK since', startDate);
    await writeDiag({ ranAt, startDate, bridgeReady: true, error: hkErr, samples: 0, imported: 0 });
    return 0;
  }
  console.log(`[healthKitWeight] received ${samples.length} samples from HK since ${startDate}`);

  // Apple Health can hold many readings per day (smart scale syncs, repeat
  // weigh-ins). Our body_weights table is unique on (user_id, recorded_on,
  // source): so we collapse the day's HK readings to a single row before
  // upserting. We keep the latest sample of the day; that's typically the
  // most recently entered value if the user re-weighed.
  const latestPerDay = new Map<string, RawWeightSample>();
  for (const sample of samples) {
    const day = new Date(sample.startDate).toLocaleDateString('en-CA');
    const existing = latestPerDay.get(day);
    if (!existing || new Date(sample.endDate) >= new Date(existing.endDate)) {
      latestPerDay.set(day, sample);
    }
  }

  const rows = Array.from(latestPerDay.values())
    .map((s) => sampleToRow(ctx.userId, s, ctx.periodStart, ctx.cycleLength))
    .filter((r): r is BodyWeightRow => r !== null);

  if (!rows.length) {
    await writeDiag({ ranAt, startDate, bridgeReady: true, error: null, samples: samples.length, imported: 0 });
    return 0;
  }

  // A NULL phase is the absence of information, never information itself, so it
  // must not be written over a stamp we already hold.
  //
  // This import re-reads a full year whenever the anchor is cleared (which
  // `enableWeightTracking` does deliberately, so re-enabling refills the chart),
  // and the upsert UPDATEs every column it is given. A run with no period start
  // to project from therefore rewrote every existing row's phase to null.
  //
  // Found on Emma's account 2026-09-10 after she toggled Apple Health weight
  // sync off and on: 45 readings in the baseline window, 45 of them null-phased,
  // 0 follicular. `medianFollicular` needs five, so the baseline nulled and the
  // screen fell back to CALIBRATING. Her 306 readings were all still there; only
  // the derived stamp was gone.
  //
  // Rows we could stamp are written whole. Rows we could not are written WITHOUT
  // the phase columns, so PostgREST leaves them out of the ON CONFLICT SET list:
  // an existing row keeps the phase it has, and a genuinely new row gets the
  // column default of null.
  const stamped   = rows.filter((r) => r.cycle_phase_at_time !== null);
  const unstamped = rows.filter((r) => r.cycle_phase_at_time === null);

  const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (stamped.length) {
    writes.push(supabase
      .from('body_weights')
      .upsert(stamped, { onConflict: 'user_id,recorded_on,source', ignoreDuplicates: false }));
  }
  if (unstamped.length) {
    writes.push(supabase
      .from('body_weights')
      .upsert(
        unstamped.map(({ cycle_day_at_time: _d, cycle_phase_at_time: _p, ...rest }) => rest),
        { onConflict: 'user_id,recorded_on,source', ignoreDuplicates: false },
      ));
  }

  const results = await Promise.all(writes);
  const failed  = results.find((r) => r.error);

  if (failed?.error) {
    console.warn('[healthKitWeight] upsert failed:', failed.error.message);
    await writeDiag({ ranAt, startDate, bridgeReady: true, error: `upsert: ${failed.error.message}`, samples: samples.length, imported: 0 });
    return 0;
  }

  const newest = samples[samples.length - 1].endDate;
  await AsyncStorage.setItem(ANCHOR_KEY, newest);

  await recomputeBaseline(ctx.userId).catch((e) => {
    console.warn('[healthKitWeight] baseline recompute failed:', e.message);
  });

  // Refresh any open chart screens; they listen on weightDataVersion.
  try { useProfileStore.getState().bumpWeightDataVersion(); } catch { /* store not ready, ignore */ }

  await writeDiag({ ranAt, startDate, bridgeReady: true, error: null, samples: samples.length, imported: rows.length });

  return rows.length;
}
