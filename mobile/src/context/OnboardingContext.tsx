import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import type { FitnessLevel, WeeklyMileageBracket } from '@/lib/healthKitOnboarding';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';
import type { Sex } from '@/lib/nutritionTargets';
import type { InjuryLevel } from '@/lib/injuryLevels';

export type RunningGoal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general';

export interface OnboardingData {
  firstName:         string;
  lastName:          string;
  localAvatarUri:    string | null;
  fitnessLevel:      FitnessLevel | null;
  weeklyMileage:     WeeklyMileageBracket | null;
  fiveKTime:         string;
  runningGoal:       RunningGoal | null;
  cycleProfile:      CycleProfile;
  periodStart:       Date | null;
  cycleLength:       number;
  contraceptionType: ContraceptionType | null;
  hasPlaceboWeek:    boolean | null;
  currentPackStart:  Date | null;
  // Steps 7 and 8 held these in local component state only, so going back to an
  // earlier step and returning lost them entirely. They live here now for the
  // same reason as everything above: a step that is re-entered has to be able
  // to show what the user already told us.
  dob:               Date | null;
  heightCm:          number;
  sex:               Sex;
  trackWeight:       boolean;
  injuryLevel:       InjuryLevel | null;
}

interface OnboardingContextValue {
  currentStep: number;
  setStep:     (step: number) => void;
  data:        OnboardingData;
  setData:     (patch: Partial<OnboardingData>) => void;
}

const defaultData: OnboardingData = {
  firstName:         '',
  lastName:          '',
  localAvatarUri:    null,
  fitnessLevel:      null,
  weeklyMileage:     null,
  fiveKTime:         '',
  runningGoal:       null,
  cycleProfile:      'natural',
  periodStart:       null,
  cycleLength:       28,
  contraceptionType: null,
  hasPlaceboWeek:    null,
  currentPackStart:  null,
  dob:               null,
  heightCm:          165,
  sex:               'female',
  trackWeight:       false,
  injuryLevel:       null,
};

const OnboardingContext = createContext<OnboardingContextValue>({
  currentStep: 1,
  setStep:     () => {},
  data:        defaultData,
  setData:     () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setStep] = useState(1);
  const [data, setDataState]   = useState<OnboardingData>(defaultData);

  // Stable across renders so the steps can write through from an effect without
  // the identity of `setData` itself retriggering that effect every render.
  const setData = useCallback((patch: Partial<OnboardingData>) => {
    setDataState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ currentStep, setStep, data, setData }),
    [currentStep, data, setData],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
