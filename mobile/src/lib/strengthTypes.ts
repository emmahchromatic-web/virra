export interface StrengthSet {
  reps:       number;
  weight_kg:  number;
  rpe?:       number;
}

export interface StrengthExercise {
  name:    string;
  sets:    StrengthSet[];
  notes?:  string;
}

export type SessionType = 'lower' | 'upper' | 'strength';
