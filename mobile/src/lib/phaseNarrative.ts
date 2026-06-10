import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

interface SessionStub {
  session_label: string;
}

const CUES: Record<CyclePhase, Partial<Record<TrainingLoad, string>>> = {
  luteal: {
    hard:     'Fuel hard, rest after.',
    moderate: 'Fuel hard, rest after.',
    easy:     'Keep it easy. Your body is working hard.',
    rest:     'Keep it easy. Your body is working hard.',
  },
  follicular: {
    hard:     'Your adaptation window — make it count.',
    moderate: 'Your adaptation window — make it count.',
    easy:     'Energy is rising. Build on it.',
    rest:     'Energy is rising. Build on it.',
  },
  ovulatory: {
    hard:     'Peak week. Go for it.',
    moderate: 'Peak week. Go for it.',
    easy:     'Peak week. Go for it.',
    rest:     'Peak week. Go for it.',
  },
  menstrual: {
    hard:     'Listen to your body today.',
    moderate: 'Listen to your body today.',
    easy:     'Listen to your body today.',
    rest:     'Listen to your body today.',
  },
};

function cueFor(phase: CyclePhase | null, load: TrainingLoad): string {
  if (!phase) return 'Fuel well today.';
  return CUES[phase][load] ?? 'Fuel well today.';
}

function sessionLabel(sessions: SessionStub[]): string | null {
  if (sessions.length === 0) return null;
  const raw = sessions[0].session_label;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function buildNarrative(
  phase: CyclePhase | null,
  dayOfCycle: number | null,
  sessions: SessionStub[],
  load: TrainingLoad,
): string | null {
  const hasPhase = phase !== null && dayOfCycle !== null;
  const label = sessionLabel(sessions);
  const training = label ? `${label} today` : 'Rest day';
  const cue = cueFor(phase, load);

  if (!hasPhase && sessions.length === 0) return null;

  const parts: string[] = [];
  if (hasPhase) parts.push(`${phase!.charAt(0).toUpperCase() + phase!.slice(1)} Day ${dayOfCycle}`);
  parts.push(training);
  parts.push(cue);

  return parts.join(' · ');
}
