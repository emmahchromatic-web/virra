import { colors } from '@/constants/theme';
import type { CyclePhase } from '@/lib/cycleEngine';

export interface PhaseMeta {
  label:     string;
  tagline:   string;
  training:  string;
  nutrition: string;
  lifestyle: string;
  color:     string;
}

export const PHASE_META: Record<CyclePhase, PhaseMeta> = {
  menstrual: {
    label:     'Menstrual',
    tagline:   'Rest, restore, and honour your body.',
    training:  'Easy movement only — yoga, walking, or full rest. No hard efforts.',
    nutrition: 'Iron-rich foods. Warming meals. Honour cravings without guilt.',
    lifestyle: 'Prioritise sleep and warmth. Heat pads ease cramps better than ibuprofen for many.',
    color:     colors.heat,
  },
  follicular: {
    label:     'Follicular',
    tagline:   'Energy is rising. Build on it.',
    training:  'Ramp up intensity. Strength sessions and tempo runs respond well now.',
    nutrition: 'Lean protein and complex carbs to fuel adaptation.',
    lifestyle: 'Social energy is high. Book the hard conversations and the heavy sessions now.',
    color:     colors.dawn,
  },
  ovulatory: {
    label:     'Ovulatory',
    tagline:   'Peak window. Push hard.',
    training:  'Highest-intensity workouts belong here. Your body is primed.',
    nutrition: 'High-carb day. Your muscles are ready to use every gram.',
    lifestyle: 'Communication peaks. Have the difficult conversation today — it lands lighter.',
    color:     colors.pulse,
  },
  luteal: {
    label:     'Luteal',
    tagline:   "Maintain, don't overreach.",
    training:  'Moderate effort. Honour fatigue signals — they\'re real.',
    nutrition: 'Carbs curb cravings and support mood. Magnesium helps sleep.',
    lifestyle: 'Schedule recovery. Caffeine sensitivity rises — taper after 2pm to protect sleep.',
    color:     colors.breath,
  },
};
