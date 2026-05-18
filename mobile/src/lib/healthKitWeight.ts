import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getCycleInfo } from '@/lib/cycleEngine';
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';

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
  if (periodStart) {
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

export async function importNewWeightSamples(ctx: ImportContext): Promise<number> {
  const HK = NativeModules.AppleHealthKit;
  if (!HK?.getWeightSamples) return 0;

  let Constants: any;
  try {
    Constants = require('react-native-health').Constants;
  } catch {
    return 0;
  }

  const anchorISO = await AsyncStorage.getItem(ANCHOR_KEY);
  const startDate = anchorISO ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const samples: RawWeightSample[] = await new Promise((resolve) => {
    HK.getWeightSamples(
      { unit: Constants.Units.gram, startDate, ascending: true },
      (err: string, results: RawWeightSample[]) => {
        if (err || !Array.isArray(results)) return resolve([]);
        resolve(results);
      },
    );
  });

  if (!samples.length) return 0;

  const rows = samples
    .map((s) => sampleToRow(ctx.userId, s, ctx.periodStart, ctx.cycleLength))
    .filter((r): r is BodyWeightRow => r !== null);

  if (!rows.length) return 0;

  const { error } = await supabase
    .from('body_weights')
    .upsert(rows, { onConflict: 'user_id,recorded_on,source', ignoreDuplicates: false });

  if (error) {
    console.warn('[healthKitWeight] upsert failed:', error.message);
    return 0;
  }

  const newest = samples[samples.length - 1].endDate;
  await AsyncStorage.setItem(ANCHOR_KEY, newest);

  await recomputeBaseline(ctx.userId).catch((e) => {
    console.warn('[healthKitWeight] baseline recompute failed:', e.message);
  });

  return rows.length;
}
