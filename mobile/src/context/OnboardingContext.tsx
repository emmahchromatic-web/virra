import React, { createContext, useContext, useState } from 'react';
import type { FitnessLevel, WeeklyMileageBracket } from '@/lib/healthKitOnboarding';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';

export type RunningGoal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general';

interface OnboardingData {
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

  function setData(patch: Partial<OnboardingData>) {
    setDataState((prev) => ({ ...prev, ...patch }));
  }

  return (
    <OnboardingContext.Provider value={{ currentStep, setStep, data, setData }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
